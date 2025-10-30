/*
  ui.js
  Responsible for UI rendering, event wiring, state management, and orchestrating helpers.
*/
(function(window, $){
  'use strict';
  window.App = window.App || {};

  // Internal app state
  var state = {
    file: null,
    fileName: '',
    dataURL: '',
    imgEl: null,
    exif: null,
    fields: [], // [{key, ifd, tag, label, value}]
    stripMap: {}, // key -> true/false (true means strip)
    keepMap: {}, // key -> true/false (true means keep)
    outputFormat: 'same',
    quality: 92,
    includeReport: false,
    remember: false,
    orientedCanvas: null,
    outputDataURL: ''
  };

  function categoryForKey(key){
    if (/GPS/.test(key)) return 'Location';
    if (/DateTime/.test(key)) return 'Time';
    if (/Make|Model|FNumber|Focal|Exposure|Shutter|ISO/.test(key)) return 'Camera';
    if (/Software|Artist|Copyright/.test(key)) return 'Attribution';
    if (/Orientation/.test(key)) return 'Orientation';
    return 'Other';
  }

  function loadPreferences(){
    var saved = (window.App && window.App.Storage && typeof window.App.Storage.get === 'function') ? window.App.Storage.get('prefs', null) : null;
    if (!saved) return;
    state.quality = saved.quality || 92;
    state.outputFormat = saved.outputFormat || 'same';
    state.includeReport = !!saved.includeReport;
    state.remember = !!saved.remember;
    state.stripMap = saved.stripMap || {};
  }
  function savePreferences(){
    if (!state.remember) return;
    window.App.Storage.set('prefs', {
      quality: state.quality,
      outputFormat: state.outputFormat,
      includeReport: state.includeReport,
      remember: state.remember,
      stripMap: state.stripMap
    });
  }

  function resetState(){
    state.file = null; state.fileName = ''; state.dataURL=''; state.imgEl=null; state.exif=null; state.fields=[]; state.keepMap={}; state.orientedCanvas=null; state.outputDataURL='';
  }

  function buildToggles(){
    var $wrap = $('#toggles-wrap').empty();
    if (!state.fields.length){
      $wrap.append($('<div class="text-sm text-slate-500">').text('No metadata fields detected. Most images will have at least a few EXIF entries.'));
      return;
    }
    var byCat = {};
    state.fields.forEach(function(f){
      var cat = categoryForKey(f.key);
      byCat[cat] = byCat[cat] || [];
      byCat[cat].push(f);
    });
    Object.keys(byCat).sort().forEach(function(cat){
      var $group = $(
        `<div class="rounded-xl border border-slate-200 overflow-hidden">
          <button type="button" class="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50">
            <span class="font-medium text-sm">${cat}</span>
            <span class="pill" data-role="count"></span>
          </button>
          <div class="p-2 space-y-2" data-role="body"></div>
        </div>`
      );
      var $body = $group.find('[data-role="body"]');
      byCat[cat].forEach(function(f){
        var key = f.key;
        var strip = state.stripMap.hasOwnProperty(key) ? state.stripMap[key] : true; // default strip
        var prettyVal = window.App.ValueFormat.pretty(f.label, f.value);
        var $row = $(
          `<div class="toggle-row" data-key="${key}">
            <div class="min-w-0">
              <div class="truncate text-sm"><span class="k">${f.label}</span></div>
              <div class="truncate text-xs text-slate-500" title="${prettyVal}">${prettyVal}</div>
            </div>
            <button type="button" role="switch" aria-checked="${strip}" class="toggle" data-on="${strip}">
              <span class="sr-only">Strip ${f.label}</span>
              <span class="toggle-dot"></span>
            </button>
          </div>`
        );
        $body.append($row);
      });
      $group.find('button.w-full').on('click', function(){ $body.slideToggle(150); });
      $wrap.append($group);
    });
    // Update counts
    $wrap.find('[data-role="count"]').each(function(){
      var n = $(this).closest('div').find('[data-role="body"] .toggle-row').length;
      $(this).text(n + ' fields');
    });
  }

  function renderBeforeAfter(){
    var $before = $('#meta-before').empty();
    var $after = $('#meta-after').empty();
    var beforeList = state.fields;
    var keepMap = {};
    Object.keys(state.stripMap).forEach(function(key){ keepMap[key] = !state.stripMap[key]; });
    // Before
    beforeList.forEach(function(f){
      var val = window.App.ValueFormat.pretty(f.label, f.value);
      $before.append($(`<div class="fade-in"><span class="k mr-2">${f.label}:</span><span class="v">${val}</span></div>`));
    });
    $('#meta-count').text(beforeList.length + ' fields');

    // After is computed by toggles: only kept fields
    var afterList = beforeList.filter(function(f){ return keepMap[f.key]; });
    afterList.forEach(function(f){
      var val2 = window.App.ValueFormat.pretty(f.label, f.value);
      $after.append($(`<div class="fade-in"><span class="k mr-2">${f.label}:</span><span class="v">${val2}</span></div>`));
    });
    $('#meta-after-count').text(afterList.length + ' fields');
  }

  function updateKeepMapFromUI(){
    var newStrip = {};
    $('#toggles-wrap .toggle-row').each(function(){
      var key = $(this).attr('data-key');
      var on = $(this).find('.toggle').attr('data-on') === 'true';
      newStrip[key] = on; // on means strip
    });
    state.stripMap = newStrip;
    savePreferences();
    renderBeforeAfter();
  }

  function wireToggleHandlers(){
    $('#toggles-wrap').on('click', '.toggle', function(){
      var isOn = $(this).attr('data-on') === 'true';
      $(this).attr('data-on', String(!isOn));
      $(this).attr('aria-checked', String(!isOn));
      updateKeepMapFromUI();
    });
  }

  function setPreview(dataURL, orientation){
    var img = new Image();
    img.onload = function(){
      state.imgEl = img;
      var canvas = window.App.Util.drawOrientedToCanvas(img, orientation);
      state.orientedCanvas = canvas;
      var $stage = $('#image-stage').empty();
      var $img = $('<img alt="preview">');
      $img.attr('src', canvas.toDataURL('image/jpeg', 0.92));
      $stage.append($img.hide().fadeIn(150));
      $('#img-dim').text(canvas.width + ' × ' + canvas.height + ' px');
    };
    img.src = dataURL;
  }

  function processFile(file){
    if (!file) return;
    resetState();
    state.file = file;
    state.fileName = file.name;
    $('#file-pill').removeClass('hidden').text(file.name);
    $('#download-btn').prop('disabled', false);

    window.App.Util.readFileAsDataURL(file).then(function(dataURL){
      state.dataURL = dataURL;
      var exif = window.App.EXIF.loadFromDataURL(dataURL);
      state.exif = exif;
      var fields = window.App.EXIF.mapToDisplayList(exif);
      state.fields = fields;
      // initialize stripMap: keep saved preferences for keys if available, else default strip true
      fields.forEach(function(f){
        if (!state.stripMap.hasOwnProperty(f.key)) state.stripMap[f.key] = true;
      });
      buildToggles();
      renderBeforeAfter();
      var orientation = window.App.EXIF.getOrientation(exif) || 1;
      setPreview(dataURL, orientation);
    }).catch(function(){
      alert('Could not read the file. Please try a different image.');
    });
  }

  function computeOutputDataURL(){
    if (!state.orientedCanvas) return '';
    var inputMime = window.App.Util.getMimeFromDataURL(state.dataURL);
    var outFmt = state.outputFormat === 'same' ? (inputMime === 'image/png' ? 'png' : 'jpeg') : state.outputFormat;
    var cleanDataURL = window.App.Util.exportCanvas(state.orientedCanvas, outFmt, state.quality);

    // If JPEG and user wants to keep some fields, reinsert selected ones
    if (outFmt === 'jpeg'){
      var keepMap = {};
      Object.keys(state.stripMap).forEach(function(key){ keepMap[key] = !state.stripMap[key]; });
      var selectedExif = window.App.EXIF.buildFromSelection(state.exif || {}, keepMap);
      // Only insert if at least one field exists
      var hasAny = false;
      ['0th','Exif','GPS','Interop'].forEach(function(ifd){ if (selectedExif[ifd] && Object.keys(selectedExif[ifd]).length) hasAny = true; });
      if (hasAny){
        cleanDataURL = window.App.EXIF.insertExifToDataURL(selectedExif, cleanDataURL);
      }
    }
    return cleanDataURL;
  }

  function downloadCleaned(){
    var outURL = computeOutputDataURL();
    if (!outURL){ alert('Nothing to export yet.'); return; }
    var ext = (function(){
      var mime = window.App.Util.getMimeFromDataURL(outURL);
      if (mime === 'image/png') return 'png';
      if (mime === 'image/jpeg') return 'jpg';
      return 'img';
    })();
    var base = state.fileName ? state.fileName.replace(/\.[^.]+$/, '') : 'cleaned-photo';
    var fileName = base + '.clean.' + ext;
    var blob = window.App.Util.dataURLToBlob(outURL);
    window.App.Util.downloadBlob(blob, fileName);

    if (state.includeReport){
      var keepList = [];
      Object.keys(state.stripMap).forEach(function(k){ if (!state.stripMap[k]) keepList.push(k); });
      var removedList = [];
      Object.keys(state.stripMap).forEach(function(k){ if (state.stripMap[k]) removedList.push(k); });
      var report = {
        sourceFile: state.fileName || null,
        keptFields: keepList,
        removedFields: removedList,
        time: new Date().toISOString()
      };
      var repBlob = new Blob([JSON.stringify(report, null, 2)], {type:'application/json'});
      window.App.Util.downloadBlob(repBlob, base + '.redaction-report.json');
    }
  }

  function wireEvents(){
    // Upload
    $('#file-input').on('change', function(e){ processFile(e.target.files[0]); });
    // Dropzone
    var $drop = $('#dropzone');
    $drop.on('dragenter dragover', function(e){ e.preventDefault(); e.stopPropagation(); $drop.addClass('dragover'); });
    $drop.on('dragleave dragend drop', function(e){ e.preventDefault(); e.stopPropagation(); $drop.removeClass('dragover'); });
    $drop.on('drop', function(e){ var dt = e.originalEvent.dataTransfer; if (dt && dt.files && dt.files[0]) { processFile(dt.files[0]); } });

    // Presets
    $('#preset-all').on('click', function(){ $('#toggles-wrap .toggle').attr('data-on','true').attr('aria-checked','true'); updateKeepMapFromUI(); $(this).blur(); });
    $('#preset-safe').on('click', function(){
      // Strip GPS and Time, keep Camera and Attribution by default
      $('#toggles-wrap .toggle-row').each(function(){
        var key = $(this).attr('data-key');
        var strip = (/GPS|DateTime/.test(key)) ? true : false;
        $(this).find('.toggle').attr('data-on', String(strip)).attr('aria-checked', String(strip));
      });
      updateKeepMapFromUI(); $(this).blur();
    });
    $('#preset-keep-camera').on('click', function(){
      $('#toggles-wrap .toggle-row').each(function(){
        var key = $(this).attr('data-key');
        var strip = (/Make|Model|FNumber|Focal|Exposure|Shutter|ISO|Software|Artist|Copyright/.test(key)) ? false : true;
        $(this).find('.toggle').attr('data-on', String(strip)).attr('aria-checked', String(strip));
      });
      updateKeepMapFromUI(); $(this).blur();
    });

    // Expand/collapse groups
    var collapsed = false;
    $('#toggle-expand').on('click', function(){
      collapsed = !collapsed;
      $('#toggles-wrap [data-role="body"]').each(function(){ collapsed ? $(this).slideUp(120) : $(this).slideDown(120); });
      $(this).text(collapsed ? 'Expand all' : 'Collapse all');
    });

    // Toggles
    wireToggleHandlers();

    // Quality and format
    $('#quality').on('input change', function(){ state.quality = parseInt($(this).val(), 10); $('#quality-val').text(state.quality); savePreferences(); });
    $('#format').on('change', function(){ state.outputFormat = $(this).val(); savePreferences(); });
    $('#include-report').on('change', function(){ state.includeReport = $(this).is(':checked'); savePreferences(); });
    $('#remember-choices').on('change', function(){ state.remember = $(this).is(':checked'); savePreferences(); });

    // Download
    $('#download-btn').on('click', function(){ downloadCleaned(); });
  }

  // Public API
  window.App.init = function(){
    loadPreferences();
    // Reflect saved prefs
    $('#quality').val(state.quality); $('#quality-val').text(state.quality);
    $('#format').val(state.outputFormat);
    $('#include-report').prop('checked', state.includeReport);
    $('#remember-choices').prop('checked', state.remember);
    wireEvents();
  };

  window.App.render = function(){
    // No-op initial render; UI is static until a file is selected
  };

})(window, jQuery);
