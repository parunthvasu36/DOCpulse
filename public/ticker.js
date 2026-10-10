/* DocTicker: news-channel style notice bar.
   Used by the Phone Dept screen (tv.html) and the preview on the in-charge "Scroll" tab.
   Animations: left, right (continuous scroll) and slideup, fade, blink (one notice at a time). */
(function () {
  var SPEED_PX = { slow: 55, normal: 95, fast: 160 };        // scroll speed in pixels per second
  var SPEED_HOLD = { slow: 1.5, normal: 1, fast: 0.65 };     // how long one-at-a-time notices stay
  var ANIMS = { left: 1, right: 1, slideup: 1, fade: 1, blink: 1 };

  var CSS = [
    '.tk{display:flex;align-items:stretch;height:40px;background:#1e1b2e;border-radius:9px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.35);}',
    '.tkLabel{display:flex;align-items:center;gap:7px;padding:0 14px;background:#5b5bd6;color:#fff;font:800 12px/1 system-ui,sans-serif;letter-spacing:1px;flex-shrink:0;}',
    '.tkLabel svg{width:16px;height:16px;}',
    '.tkView{flex:1;min-width:0;position:relative;overflow:hidden;display:flex;align-items:center;color:#fff;font:600 16px/40px system-ui,-apple-system,sans-serif;}',
    '.tkTrack{display:flex;width:max-content;animation-timing-function:linear;animation-iteration-count:infinite;will-change:transform;}',
    '.tkGroup{display:flex;flex-shrink:0;white-space:nowrap;}',
    '.tkItem{padding:0 16px;}',
    '.tkSep{color:#8b8be8;font-size:10px;}',
    '@keyframes tkLeft{from{transform:translateX(0)}to{transform:translateX(-50%)}}',
    '@keyframes tkRight{from{transform:translateX(-50%)}to{transform:translateX(0)}}',
    '.tkOne{position:absolute;top:0;left:0;right:0;padding:0 18px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '@keyframes tkUpIn{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}',
    '@keyframes tkUpOut{from{transform:translateY(0);opacity:1}to{transform:translateY(-100%);opacity:0}}',
    '@keyframes tkFadeIn{from{opacity:0}to{opacity:1}}',
    '@keyframes tkFadeOut{from{opacity:1}to{opacity:0}}',
    '@keyframes tkBlink{0%,49%{opacity:1}50%,100%{opacity:.12}}',
    '.tk-slideup-in{animation:tkUpIn .5s ease-out forwards;}',
    '.tk-slideup-out{animation:tkUpOut .45s ease-in forwards;}',
    '.tk-fade-in{animation:tkFadeIn .7s ease forwards;}',
    '.tk-fade-out{animation:tkFadeOut .45s ease forwards;}',
    '.tk-blink-in{animation:tkBlink 1s steps(1,end) infinite;}'
  ].join('\n');

  var BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  function injectCss() {
    if (document.getElementById('tkStyle')) return;
    var st = document.createElement('style');
    st.id = 'tkStyle';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // host: an empty <div>. opts.hideWhenEmpty hides the whole bar when there is nothing to show.
  function create(host, opts) {
    opts = opts || {};
    injectCss();
    host.classList.add('tk');
    host.innerHTML = '<div class="tkLabel">' + BELL + '<span>NOTICE</span></div><div class="tkView"></div>';
    var view = host.querySelector('.tkView');
    var token = 0, sig = '', cur = null, resizeTimer = null;

    function stop() { token++; view.innerHTML = ''; }

    function marquee(items, dir, speed) {
      var unit = items.map(function (t) {
        return '<span class="tkItem">' + esc(t) + '</span><span class="tkSep">&#9670;</span>';
      }).join('');
      var track = document.createElement('div');
      track.className = 'tkTrack';
      track.innerHTML = '<div class="tkGroup">' + unit + '</div>';
      view.appendChild(track);
      // repeat the notices until one group is at least as wide as the bar, so there is never a gap
      var unitW = track.firstChild.getBoundingClientRect().width || 0;
      var viewW = view.clientWidth || 0;
      var reps = unitW > 0 ? Math.min(40, Math.max(1, Math.ceil(viewW / unitW))) : 3;
      var group = new Array(reps + 1).join(unit);
      track.innerHTML = '<div class="tkGroup">' + group + '</div><div class="tkGroup">' + group + '</div>';
      var groupW = track.firstChild.getBoundingClientRect().width || (unitW * reps) || 1200;
      track.style.animationName = dir === 'right' ? 'tkRight' : 'tkLeft';
      track.style.animationDuration = Math.max(6, groupW / SPEED_PX[speed]) + 's';
    }

    function oneByOne(items, mode, speed) {
      var my = token, i = 0;
      function show() {
        if (my !== token) return;
        var text = items[i % items.length];
        var node = document.createElement('div');
        node.className = 'tkOne tk-' + mode + '-in';
        node.textContent = text;
        view.innerHTML = '';
        view.appendChild(node);
        var hold = (3200 + text.length * 45) * SPEED_HOLD[speed];
        setTimeout(function () {
          if (my !== token) return;
          if (mode === 'blink') { i++; show(); return; }
          node.className = 'tkOne tk-' + mode + '-out';
          setTimeout(function () { i++; show(); }, 450);
        }, hold);
      }
      show();
    }

    function render() {
      stop();
      var items = cur.items;
      if (!items.length) {
        if (opts.hideWhenEmpty) { host.style.display = 'none'; return; }
        host.style.display = '';
        view.innerHTML = '<div class="tkOne" style="opacity:.6">' + esc(opts.emptyText || '') + '</div>';
        return;
      }
      host.style.display = '';
      if (cur.animation === 'left' || cur.animation === 'right') marquee(items, cur.animation, cur.speed);
      else oneByOne(items, cur.animation, cur.speed);
    }

    // cfg = { animation, speed, items: [ 'text' | { text } ] }. Does nothing if nothing changed,
    // so the animation is not restarted every time the screen refreshes its data.
    function update(cfg) {
      cfg = cfg || {};
      var items = (cfg.items || []).map(function (x) { return typeof x === 'string' ? x : (x && x.text); })
        .filter(function (t) { return t && String(t).trim(); });
      var next = {
        animation: ANIMS[cfg.animation] ? cfg.animation : 'left',
        speed: SPEED_PX[cfg.speed] ? cfg.speed : 'normal',
        items: items
      };
      var s = JSON.stringify(next);
      if (s === sig) return;
      sig = s; cur = next; render();
    }

    // Redraw (e.g. when the bar becomes visible after being hidden, so widths are measured correctly)
    function refresh() { if (cur) render(); }

    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(refresh, 250);
    });

    return { update: update, refresh: refresh };
  }

  window.DocTicker = { create: create };
})();
