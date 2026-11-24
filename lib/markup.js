// Static markup for the studio UI. The engine (lib/engine.js) wires it up.
export const MARKUP = `
<!-- ============ HOME ============ -->
  <section id="screen-home" class="screen active">
    <div class="home">
      <header class="brand">
        <div class="logo"><span class="dot"></span>Podcast Studio</div>
        <p class="tagline">Rekam podcast online bareng siapa aja. Kamera otomatis nyorot yang lagi ngomong.</p>
      </header>

      <div class="cards">
        <div class="card">
          <h2>Bikin studio</h2>
          <p class="muted">Lu jadi host. Nanti dapet kode buat ngundang tamu.</p>
          <label>Nama lu<input id="host-name" maxlength="32" placeholder="mis. Rizqi" autocomplete="name" /></label>
          <label>Judul episode <span class="muted">(opsional)</span><input id="room-title" maxlength="60" placeholder="mis. Ngobrol Santai Eps. 1" /></label>
          <button id="btn-create" class="btn primary">Bikin studio</button>
        </div>

        <div class="card">
          <h2>Gabung</h2>
          <p class="muted">Masukin kode undangan dari host.</p>
          <label>Kode undangan<input id="join-code" maxlength="6" placeholder="ABC123" autocapitalize="characters" autocomplete="off" spellcheck="false" class="code-input" /></label>
          <label>Nama lu<input id="guest-name" maxlength="32" placeholder="mis. Tamu" autocomplete="name" /></label>
          <button id="btn-join" class="btn">Gabung</button>
        </div>
      </div>
      <p id="home-error" class="error" role="alert"></p>
    </div>
  </section>

  <!-- ============ LOBBY (device check) ============ -->
  <section id="screen-lobby" class="screen">
    <div class="lobby">
      <div class="lobby-preview">
        <div class="preview-box">
          <video id="preview" autoplay playsinline muted></video>
          <div id="preview-off" class="preview-off hidden">Kamera mati</div>
          <div class="meter"><div id="preview-meter"></div></div>
        </div>
        <div class="row center gap">
          <button id="lobby-mic" class="round on" title="Mikrofon"></button>
          <button id="lobby-cam" class="round on" title="Kamera"></button>
        </div>
      </div>
      <div class="lobby-side">
        <p class="eyebrow" id="lobby-eyebrow">Siap masuk</p>
        <h2 id="lobby-title">Studio</h2>
        <p class="muted" id="lobby-sub"></p>
        <label>Mikrofon<select id="sel-mic"></select></label>
        <label>Kamera<select id="sel-cam"></select></label>
        <button id="btn-enter" class="btn primary">Masuk studio</button>
        <button id="btn-back" class="btn ghost">Kembali</button>
        <p class="hint">Pake headphone/earphone biar suara nggak gema ke mic orang lain.</p>
        <p id="lobby-error" class="error" role="alert"></p>
      </div>
    </div>
  </section>

  <!-- ============ STUDIO ============ -->
  <section id="screen-studio" class="screen">
    <div class="studio">
      <header class="topbar">
        <div class="topbar-left">
          <span class="logo small"><span class="dot"></span></span>
          <span id="studio-title" class="studio-title">Studio</span>
          <span id="rec-badge" class="rec-badge hidden"><span class="rec-dot"></span>REC <span id="rec-time">00:00</span></span>
        </div>
        <div class="topbar-right">
          <span id="view-label" class="view-label">Auto</span>
          <button id="btn-invite" class="chip">Kode: <b id="code-label">------</b></button>
        </div>
      </header>

      <main id="stage" class="stage"></main>

      <footer class="controls">
        <button id="ctl-mic" class="ctl" title="Mic (M)"><span class="ic"></span><span class="lbl">Mic</span></button>
        <button id="ctl-cam" class="ctl" title="Kamera (V)"><span class="ic"></span><span class="lbl">Kamera</span></button>
        <button id="ctl-flip" class="ctl hidden" title="Ganti kamera"><span class="ic"></span><span class="lbl">Balik</span></button>
        <div class="sep host-only"></div>
        <div class="seg host-only" id="ctl-layout" role="group" aria-label="Tampilan">
          <button data-layout="auto" title="Otomatis: sorot yang ngomong, sesekali tampil semua">Auto</button>
          <button data-layout="speaker" title="Selalu sorot yang ngomong">Sorot</button>
          <button data-layout="grid" title="Tampilkan semua">Semua</button>
        </div>
        <button id="ctl-rec" class="ctl rec host-only" title="Rekam (R)"><span class="ic"></span><span class="lbl">Rekam</span></button>
        <div class="sep"></div>
        <button id="ctl-people" class="ctl" title="Peserta"><span class="ic"></span><span class="lbl" id="people-count">1</span></button>
        <button id="ctl-leave" class="ctl danger" title="Keluar"><span class="ic"></span><span class="lbl">Keluar</span></button>
      </footer>

      <aside id="people-panel" class="panel hidden">
        <div class="panel-head"><b>Peserta</b><button class="x" data-close="people-panel">✕</button></div>
        <ul id="people-list"></ul>
      </aside>
    </div>
  </section>

  <!-- ============ MODALS ============ -->
  <div id="modal-invite" class="modal hidden">
    <div class="modal-card">
      <button class="x" data-close="modal-invite">✕</button>
      <h3>Undang tamu</h3>
      <p class="muted">Kasih kode ini, atau kirim link-nya. Bisa dibuka di HP, tablet, atau laptop.</p>
      <div class="big-code" id="invite-code">------</div>
      <div class="link-row"><input id="invite-link" readonly /><button id="btn-copy" class="btn">Salin link</button></div>
      <button id="btn-share" class="btn ghost hidden">Bagikan…</button>
    </div>
  </div>

  <div id="modal-done" class="modal hidden">
    <div class="modal-card">
      <button class="x" data-close="modal-done">✕</button>
      <h3>Rekaman selesai 🎉</h3>
      <p class="muted" id="done-sub"></p>
      <div class="downloads" id="downloads"></div>
      <p class="hint">File disimpan di perangkat lu, nggak diupload ke server.</p>
    </div>
  </div>

  <div id="toast" class="toast"></div>
`;
