/*
  helpers.js
  Utilities, local storage helper, data URL helpers, canvas processing, and a minimal embedded EXIF tool via piexifjs for JPEG selective keep.
*/
(function(window){
  'use strict';
  window.App = window.App || {};

  // Simple namespaced storage helper
  window.App.Storage = (function(){
    var ns = 'privacy-prep:';
    function set(key, value){
      try { localStorage.setItem(ns + key, JSON.stringify(value)); } catch(e) { /* ignore */ }
    }
    function get(key, fallback){
      try {
        var raw = localStorage.getItem(ns + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch(e) { return fallback; }
    }
    function remove(key){
      try { localStorage.removeItem(ns + key); } catch(e) { /* ignore */ }
    }
    return { set: set, get: get, remove: remove };
  })();

  // File and image helpers
  window.App.Util = (function(){
    function readFileAsDataURL(file){
      return new Promise(function(resolve, reject){
        var fr = new FileReader();
        fr.onload = function(){ resolve(fr.result); };
        fr.onerror = function(e){ reject(e); };
        fr.readAsDataURL(file);
      });
    }
    function readFileAsArrayBuffer(file){
      return new Promise(function(resolve, reject){
        var fr = new FileReader();
        fr.onload = function(){ resolve(fr.result); };
        fr.onerror = function(e){ reject(e); };
        fr.readAsArrayBuffer(file);
      });
    }
    function dataURLToBlob(dataURL){
      var arr = dataURL.split(',');
      var mime = arr[0].match(/:(.*?);/)[1];
      var bstr = atob(arr[1]);
      var n = bstr.length;
      var u8arr = new Uint8Array(n);
      for (var i=0; i<n; i++) u8arr[i] = bstr.charCodeAt(i);
      return new Blob([u8arr], {type: mime});
    }
    function downloadBlob(blob, filename){
      var a = document.createElement('a');
      var url = URL.createObjectURL(blob);
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 0);
    }
    function getMimeFromDataURL(dataURL){
      var m = /^data:(.*?);/.exec(dataURL);
      return m ? m[1] : 'application/octet-stream';
    }

    // Draw image to canvas with EXIF orientation applied
    function drawOrientedToCanvas(img, orientation){
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      var rotate = 0, flipH = false, flipV = false;
      // Orientation mapping per EXIF spec
      // 1: normal, 2: flipH, 3: rotate180, 4: flipV, 5: rot90+flipH, 6: rot90, 7: rot270+flipH, 8: rot270
      switch(orientation){
        case 2: flipH = true; break;
        case 3: rotate = 180; break;
        case 4: flipV = true; break;
        case 5: rotate = 90; flipH = true; break;
        case 6: rotate = 90; break;
        case 7: rotate = 270; flipH = true; break;
        case 8: rotate = 270; break;
      }
      var rotated = (rotate === 90 || rotate === 270);
      canvas.width = rotated ? h : w;
      canvas.height = rotated ? w : h;
      ctx.save();
      // Move to center for rotation/flip transforms
      ctx.translate(canvas.width/2, canvas.height/2);
      if (rotate) ctx.rotate(rotate * Math.PI/180);
      var sx = flipH ? -1 : 1;
      var sy = flipV ? -1 : 1;
      ctx.scale(sx, sy);
      // Draw image centered
      var dw = rotated ? h : w;
      var dh = rotated ? w : h;
      ctx.drawImage(img, -dw/2, -dh/2, dw, dh);
      ctx.restore();
      return canvas;
    }

    function exportCanvas(canvas, format, quality){
      var type = 'image/jpeg';
      if (format === 'png') type = 'image/png';
      return canvas.toDataURL(type, Math.min(Math.max(quality/100, 0.7), 1));
    }

    function debounce(fn, wait){
      var t; return function(){
        var ctx = this, args = arguments; clearTimeout(t);
        t = setTimeout(function(){ fn.apply(ctx, args); }, wait);
      };
    }

    return {
      readFileAsDataURL: readFileAsDataURL,
      readFileAsArrayBuffer: readFileAsArrayBuffer,
      dataURLToBlob: dataURLToBlob,
      downloadBlob: downloadBlob,
      getMimeFromDataURL: getMimeFromDataURL,
      drawOrientedToCanvas: drawOrientedToCanvas,
      exportCanvas: exportCanvas,
      debounce: debounce
    };
  })();

  // Minimal value formatter for display
  window.App.ValueFormat = {
    pretty: function(key, value){
      if (value == null) return '';
      if (Array.isArray(value)) return value.join(', ');
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }
  };

  // EXIF library (piexifjs) is provided via CDN in app.html.
  // If it's unavailable, the app degrades gracefully (no EXIF keep/insertion; labels may be numeric).
  if (!window.piexif) {
    try { console.warn('[Privacy Prep] piexifjs not loaded; EXIF features will be limited.'); } catch(e) { /* noop */ }
  }

  // EXIF adapter helpers specific to our app
  window.App.EXIF = (function(){
    // Map numeric EXIF tag IDs to human-readable names
    var TagNameResolver = (function(){
      var maps = null;
      function ensure(){
        if (maps) return;
        maps = {};
        if (window.piexif && window.piexif.TagNames){
          ['0th','Exif','GPS','Interop','1st'].forEach(function(ifd){
            var tn = window.piexif.TagNames[ifd];
            if (tn) maps[ifd] = tn; // keys become strings automatically
          });
        }
      }
      function nameFor(ifd, tag){
        ensure();
        var t = String(tag);
        if (maps && maps[ifd] && maps[ifd][t]) return maps[ifd][t];
        var n = parseInt(t, 10);
        if (n === 256) return 'ImageWidth';
        if (n === 257) return 'ImageLength';
        if (n === 274) return 'Orientation';
        return t;
      }
      return { nameFor: nameFor };
    })();

    function loadFromDataURL(dataURL){
      try { return window.piexif.load(dataURL); }
      catch(e){ return {"0th":{},Exif:{},GPS:{},Interop:{},"1st":{},thumbnail:null}; }
    }

    function removeAll(dataURL){
      try { return window.piexif.remove(dataURL); }
      catch(e){ return dataURL; }
    }

    function buildFromSelection(original, keepMap){
      var dest = {"0th":{},Exif:{},GPS:{},Interop:{},"1st":{},thumbnail:null};
      function copyAllowed(ifd){
        var src = original[ifd] || {};
        var out = dest[ifd];
        Object.keys(src).forEach(function(tag){
          var name = (window.piexif && window.piexif.TagNames && window.piexif.TagNames[ifd] && window.piexif.TagNames[ifd][tag]) || TagNameResolver.nameFor(ifd, tag);
          var key = ifd + ':' + name;
          if (keepMap[key]) out[tag] = src[tag];
        });
      }
      copyAllowed('0th');
      copyAllowed('Exif');
      copyAllowed('GPS');
      copyAllowed('Interop');
      // Never keep Orientation if we already oriented the pixels
      var orientationTag = (window.piexif && window.piexif.ImageIFD && window.piexif.ImageIFD.Orientation) || 274;
      if (dest['0th'] && dest['0th'][orientationTag] != null) delete dest['0th'][orientationTag];
      return dest;
    }

    function insertExifToDataURL(exifObj, dataURL){
      try {
        var exifStr = window.piexif.dump(exifObj);
        return window.piexif.insert(exifStr, dataURL);
      } catch(e) { return dataURL; }
    }

    function mapToDisplayList(exifObj){
      var items = [];
      function pushIFD(ifd){
        var ifdObj = exifObj[ifd] || {};
        Object.keys(ifdObj).forEach(function(tag){
          var name = (window.piexif && window.piexif.TagNames && window.piexif.TagNames[ifd] && window.piexif.TagNames[ifd][tag]) || TagNameResolver.nameFor(ifd, tag);
          items.push({ key: ifd + ':' + name, ifd: ifd, tag: tag, label: name, value: ifdObj[tag] });
        });
      }
      pushIFD('0th'); pushIFD('Exif'); pushIFD('GPS'); pushIFD('Interop');
      return items;
    }

    function getOrientation(exifObj){
      var orientationTag = (window.piexif && window.piexif.ImageIFD && window.piexif.ImageIFD.Orientation) || 274;
      return (exifObj && exifObj['0th'] && exifObj['0th'][orientationTag]) || 1;
    }

    return { loadFromDataURL: loadFromDataURL, removeAll: removeAll, buildFromSelection: buildFromSelection, insertExifToDataURL: insertExifToDataURL, mapToDisplayList: mapToDisplayList, getOrientation: getOrientation };
  })();

})(window);
