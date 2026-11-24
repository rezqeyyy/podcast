// Static markup for the studio UI. The engine (lib/engine.js) wires it up.
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  logo: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/>', 'stroke-width="2.4"'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  enter: svg('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>'),
  focus: svg('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>'),
  sliders: svg('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3"/>'),
  shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
  back: svg('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
};

export const MARKUP = `
<!-- ============ HOME ============ -->
  <section id="screen-home" class="screen active">
    <div class="home-wrap">
      <div class="home">
        <nav class="nav">
          <div class="logo"><span class="logo-mark">${I.logo}</span>Podcast Studio</div>
          <span class="nav-meta"><span class="status-dot"></span>Rekaman diproses di perangkatmu</span>
        </nav>

        <div class="hero">
          <div class="hero-copy">
            <p class="eyebrow">Studio podcast online</p>
            <h1>Rekam podcast kualitas studio, <em>langsung dari browser.</em></h1>
            <p class="tagline">Undang tamu lewat link, kamera otomatis menyorot siapa pun yang sedang bicara, dan hasil rekaman langsung tersimpan di perangkatmu.</p>
            <ul class="features">
              <li><span class="feat-ic">${I.focus}</span><span><b>Auto-framing</b>Kamera berpindah ke pembicara secara otomatis.</span></li>
              <li><span class="feat-ic">${I.sliders}</span><span><b>Mixer volume</b>Atur level tiap peserta untuk hasil rekaman yang seimbang.</span></li>
              <li><span class="feat-ic">${I.file}</span><span><b>Video + audio terpisah</b>Siap diedit tanpa perlu upload ke server.</span></li>
            </ul>
          </div>

          <div class="cards">
            <div class="card">
              <div class="card-head">
                <span class="card-ic">${I.plus}</span>
                <div><h2>Buat studio baru</h2><p>Kamu jadi host dan mendapat kode undangan.</p></div>
              </div>
              <div class="field-row">
                <label>Nama kamu<input id="host-name" maxlength="32" placeholder="mis. Rizqi" autocomplete="name" /></label>
                <label>Judul episode <span class="opt">(opsional)</span><input id="room-title" maxlength="60" placeholder="mis. Eps. 1" /></label>
              </div>
              <button id="btn-create" class="btn primary block">Buat studio</button>
            </div>

            <div class="card">
              <div class="card-head">
                <span class="card-ic alt">${I.enter}</span>
                <div><h2>Gabung ke studio</h2><p>Masukkan kode undangan dari host.</p></div>
              </div>
              <div class="field-row">
                <label>Kode undangan<input id="join-code" maxlength="6" placeholder="ABC123" autocapitalize="characters" autocomplete="off" spellcheck="false" class="code-input" /></label>
                <label>Nama kamu<input id="guest-name" maxlength="32" placeholder="mis. Tamu" autocomplete="name" /></label>
              </div>
              <button id="btn-join" class="btn block">Gabung</button>
            </div>
            <p id="home-error" class="error" role="alert"></p>
          </div>
        </div>

        <footer class="foot">
          <span>Podcast Studio</span>
          <span>Bisa dipakai di laptop, tablet, dan HP Â· Paling stabil di Chrome / Edge</span>
        </footer>
      </div>
    </div>
  </section>

  <!-- ============ LOBBY (device check) ============ -->
  <section id="screen-lobby" class="screen">
    <div class="lobby-wrap">
      <div class="lobby-top">
        <div class="logo"><span class="logo-mark">${I.logo}</span>Podcast Studio</div>
        <button id="btn-back" class="btn ghost">${I.back}Kembali</button>
      </div>
      <div class="lobby">
        <div class="lobby-preview">
          <div class="preview-box" id="preview-box">
            <video id="preview" autoplay playsinline muted></video>
            <div id="preview-off" class="preview-off hidden">Kamera mati</div>
            <span id="preview-name" class="preview-name"></span>
            <div class="meter"><div id="preview-meter"></div></div>
          </div>
          <div class="row center gap preview-actions">
            <button id="lobby-mic" class="round" title="Mikrofon" aria-label="Mikrofon"></button>
            <button id="lobby-cam" class="round" title="Kamera" aria-label="Kamera"></button>
          </div>
        </div>
        <div class="lobby-side">
          <p class="eyebrow" id="lobby-eyebrow">Siap masuk</p>
          <h2 id="lobby-title">Studio</h2>
          <p class="muted" id="lobby-sub"></p>
          <label>Kamera<select id="sel-cam"></select></label>
          <label>Mikrofon<select id="sel-mic"></select></label>
          <button id="btn-enter" class="btn primary block">Masuk studio</button>
          <p class="hint">Gunakan headphone atau earphone agar suara tidak menggema ke mic peserta lain. Kamera &amp; mic bisa diganti kapan saja di dalam studio.</p>
          <p id="lobby-error" class="error" role="alert"></p>
        </div>
      </div>
    </div>
  </section>

  <!-- ============ STUDIO ============ -->
  <section id="screen-studio" class="screen">
    <div class="studio">
      <header class="topbar">
        <div class="topbar-left">
          <span class="logo small"><span class="logo-mark">${I.logo}</span></span>
          <div class="title-block">
            <span id="studio-title" class="studio-title">Studio</span>
            <span id="studio-sub" class="studio-sub">1 peserta</span>
          </div>
          <span id="rec-badge" class="rec-badge hidden"><span class="rec-dot"></span>REC <span id="rec-time">00:00</span></span>
        </div>
        <div class="topbar-right">
          <span id="view-label" class="view-label">Auto</span>
          <button id="btn-invite" class="chip" title="Undang tamu">${I.link}<span class="chip-lbl">Kode</span><b id="code-label">------</b></button>
        </div>
      </header>

      <main id="stage" class="stage"></main>

      <footer class="controls">
        <div class="ctl-group left">
          <button id="ctl-mic" class="ctl" title="Mic (M)" aria-label="Mic"><span class="ic"></span><span class="lbl">Mic</span></button>
          <button id="ctl-cam" class="ctl" title="Kamera (V)" aria-label="Kamera"><span class="ic"></span><span class="lbl">Kamera</span></button>
          <button id="ctl-flip" class="ctl hidden" title="Kamera berikutnya" aria-label="Kamera berikutnya"><span class="ic"></span><span class="lbl">Ganti</span></button>
          <button id="ctl-devices" class="ctl" title="Pilih kamera & mic (D)" aria-label="Perangkat"><span class="ic"></span><span class="lbl">Perangkat</span></button>
        </div>
        <div class="ctl-group center">
          <div class="seg host-only" id="ctl-layout" role="group" aria-label="Tampilan">
            <button data-layout="auto" title="Otomatis: sorot pembicara, sesekali tampilkan semua (1)">Auto</button>
            <button data-layout="speaker" title="Selalu sorot pembicara (2)">Sorot</button>
            <button data-layout="grid" title="Tampilkan semua (3)">Semua</button>
          </div>
          <button id="ctl-rec" class="ctl rec host-only" title="Rekam (R)" aria-label="Rekam"><span class="ic"></span><span class="lbl">Rekam</span></button>
        </div>
        <div class="ctl-group right">
          <button id="ctl-mixer" class="ctl" title="Mixer volume (X)" aria-label="Mixer volume"><span class="ic"></span><span class="lbl">Mixer</span></button>
          <button id="ctl-people" class="ctl" title="Peserta" aria-label="Peserta"><span class="ic"></span><span class="lbl">Peserta</span><span class="badge" id="people-count">1</span></button>
          <button id="ctl-leave" class="ctl danger" title="Keluar" aria-label="Keluar"><span class="ic"></span><span class="lbl">Keluar</span></button>
        </div>
      </footer>

      <aside id="people-panel" class="panel hidden" aria-label="Peserta">
        <div class="panel-head"><div><b>Peserta</b><small>Maksimal 8 orang per studio</small></div><button class="x" data-close="people-panel" aria-label="Tutup">${I.x}</button></div>
        <div class="panel-body"><ul id="people-list" class="people-list"></ul></div>
      </aside>

      <aside id="mixer-panel" class="panel hidden" aria-label="Mixer volume">
        <div class="panel-head"><div><b>Mixer volume</b><small id="mixer-sub">Atur level tiap sumber suara</small></div><button class="x" data-close="mixer-panel" aria-label="Tutup">${I.x}</button></div>
        <div class="panel-body">
          <div class="mix-master host-only">
            <div class="row between"><b>Master rekaman</b><span class="mix-pct" id="mix-master-val">100%</span></div>
            <input type="range" id="mix-master" min="0" max="200" step="1" value="100" aria-label="Volume master rekaman" />
          </div>
          <p class="section-label">Sumber suara</p>
          <ul id="mixer-list" class="mixer-list"></ul>
          <p class="hint" id="mixer-hint"></p>
        </div>
      </aside>

      <aside id="devices-panel" class="panel hidden" aria-label="Perangkat">
        <div class="panel-head"><div><b>Perangkat</b><small>Ganti tanpa keluar dari studio</small></div><button class="x" data-close="devices-panel" aria-label="Tutup">${I.x}</button></div>
        <div class="panel-body">
          <label>Kamera<select id="studio-cam"></select></label>
          <label>Mikrofon<select id="studio-mic"></select></label>
          <p class="hint">Perubahan langsung terkirim ke semua peserta dan ikut masuk ke rekaman yang sedang berjalan. Pilihan terakhir diingat untuk sesi berikutnya.</p>
        </div>
      </aside>
    </div>
  </section>

  <!-- ============ MODALS ============ -->
  <div id="modal-invite" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="invite-h">
    <div class="modal-card">
      <button class="x" data-close="modal-invite" aria-label="Tutup">${I.x}</button>
      <h3 id="invite-h">Undang tamu</h3>
      <p class="muted">Bagikan kode ini atau kirim link-nya. Bisa dibuka di HP, tablet, atau laptop.</p>
      <div class="big-code" id="invite-code">------</div>
      <div class="link-row"><input id="invite-link" readonly aria-label="Link undangan" /><button id="btn-copy" class="btn">${I.copy}Salin link</button></div>
      <button id="btn-share" class="btn ghost hidden">${I.share}Bagikanâ€¦</button>
    </div>
  </div>

  <div id="modal-done" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="done-h">
    <div class="modal-card">
      <button class="x" data-close="modal-done" aria-label="Tutup">${I.x}</button>
      <h3 id="done-h">Rekaman selesai</h3>
      <p class="muted" id="done-sub"></p>
      <div class="downloads" id="downloads"></div>
      <p class="hint">${''}File disimpan di perangkatmu dan tidak diupload ke server.</p>
    </div>
  </div>

  <div id="toast" class="toast" role="status" aria-live="polite"></div>
`;
