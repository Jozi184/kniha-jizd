(() => {
  'use strict';
  const trustedOrigin = 'https://jozi184.github.io';
  if (location.origin !== trustedOrigin || (location.pathname && !location.pathname.startsWith("/kniha-jizd/")) || window.top !== window || !window.webkit?.messageHandlers?.nativeRide) return;
  if (window.__nativeBridgeInstalled) return;
  window.__nativeBridgeInstalled = true;
  window.__nativePauseSupported = true;
  const send = body => window.webkit.messageHandlers.nativeRide.postMessage(body);
  let latest = null;
  let pending = false;
  let selectedId = null;
  let previousActiveId = null;
  let contextKey = null;
  let queueKey = null;
  const acknowledgements = new Map();
  const userId = () => window.rideAccount?.user?.id;
  const owns = ride => !ride.userId || ride.userId === userId();
  const queue = () => (latest?.pendingRides || (latest?.ride?.endedAt != null ? [latest.ride] : [])).filter(owns);
  function acknowledge(id, action = 'saved') {
    if (Date.now() - (acknowledgements.get(id) || 0) < 5000) return;
    acknowledgements.set(id, Date.now());
    send({action, id, userId: userId()});
  }
  function syncContext() {
    if (!userId()) {
      if (contextKey !== null) send({action: 'clearContext'});
      contextKey = null; selectedId = null;
      return;
    }
    if (!ready()) return;
    const odometer = loadOdometer(), key = userId() + ':' + odometer;
    if (contextKey !== key) { contextKey = key; send({action: 'context', userId: userId(), odometer}); }
  }
  window.__clearNativeAccount = () => {
    contextKey = null; selectedId = null; send({action: 'clearContext'});
  };
  function renderQueue() {
    const panel = $('nativeQueuePanel');
    if (!panel) return;
    const items = queue().filter(ride => !log.trips.some(t => t.nativeRideId === ride.id));
    panel.classList.toggle('hidden', !items.length);
    $('nativeQueueCount').textContent = items.length;
    $('nativeQueueHelp').textContent = latest?.ride?.endedAt == null && latest?.ride
      ? 'Další jízda probíhá. Uložené záznamy zkontroluješ po jejím ukončení.'
      : 'Záznamy jsou uložené v telefonu. Schválené jízdy se objeví i na PC. Tachometr se změní až po uložení.';
    const key = JSON.stringify([items.map(r => [r.id, r.distanceKm]), !!state.draft, !!latest?.ride && latest.ride.endedAt == null, userId()]);
    if (queueKey === key) return;
    queueKey = key;
    const list = $('nativeQueueList'); list.replaceChildren();
    for (const ride of items) {
      const row = document.createElement('div'); row.className = 'native-queue-row';
      const label = document.createElement('span');
      label.textContent = new Date(ride.startedAt).toLocaleString('cs-CZ') + ' · ' + ride.distanceKm.toFixed(3).replace('.', ',') + ' km';
      const button = document.createElement('button'); button.className = 'secondary'; button.type = 'button';
      button.textContent = 'Zkontrolovat'; button.disabled = !!state.draft || !!(latest?.ride && latest.ride.endedAt == null);
      button.addEventListener('click', () => { if (!ready() || state.draft || latest?.ride?.endedAt == null && latest?.ride) return; selectedId = ride.id; showReview(ride); renderQueue(); });
      row.append(label, button); list.append(row);
    }
  }
  function showReview(ride) {
    if (state.draft?.nativeRideId === ride.id) return;
    if (state.draft && !state.draft.nativeRideId) return;
    clearInterval(state.timerId); state.timerId = null;
    state.startedAt = ride.startedAt; state.distanceKm = ride.distanceKm; state.route = ride.route;
    // Pending rides have provisional odometers. Rebase each approval to the latest
    // approved account value so discards and out-of-order reviews cannot add gaps.
    const odometer = loadOdometer();
    state.draft = {nativeRideId: ride.id, startedAt: ride.startedAt, endedAt: ride.endedAt,
      distanceKm: ride.distanceKm, route: ride.route, pausedMilliseconds: ride.pause?.accumulatedMs || 0, odometerStart: odometer, odometerEnd: odometer + ride.distanceKm};
    localRemove('activeTrip'); prepareFinish();
    $('finalDistance').textContent = ride.distanceKm.toFixed(3);
    $('finalOdometer').textContent = formatOdometer(state.draft.odometerEnd);
    $('idlePanel').classList.add('hidden'); $('activePanel').classList.add('hidden'); $('finishPanel').classList.remove('hidden');
    $('backToMain').textContent = 'Zpět na seznam'; $('backToMain').classList.remove('hidden');
  }
  const ready = () => typeof storageReady !== 'undefined' && storageReady && !storageBusy;
  const timer = () => { clearInterval(state.timerId); state.timerId = setInterval(renderLive, 1000); };
  function apply() {
    syncContext();
    if (!ready() || !latest || !userId()) return;
    for (const item of queue()) { if (log.trips.some(t => t.nativeRideId === item.id)) acknowledge(item.id); }
    if ($('nativeBackgroundPanel')) {
      $('nativeBackgroundPanel').classList.remove('hidden');
      $('nativeBackgroundStatus').textContent = latest.backgroundReady ? 'Připraveno. Tlačítko přidej na zamčenou obrazovku nebo do Ovládacího centra.' : 'Pro spuštění bez otevření aplikace povol polohu Vždy a Přesnou polohu.';
      $('nativeAllowBackground').classList.toggle('hidden', !!latest.backgroundReady);
    }
    const {ride, message, speedKmh, accuracyMetres, lastLocationAtMs} = latest;
    pending = false;
    if (!ride) {
      if (previousActiveId) {
        const completed = queue().find(r => r.id === previousActiveId);
        previousActiveId = null;
        if (completed) selectedId = completed.id;
      }
      const selected = queue().find(r => r.id === selectedId);
      if (selected && !log.trips.some(t => t.nativeRideId === selected.id)) showReview(selected);
      renderQueue();
      if (message) {
        $('idleStatus').textContent = message;
        if (!$('gpsTestResult').classList.contains('hidden')) $('gpsTestResult').textContent = message;
      }
      return;
    }
    if (ride.userId && ride.userId !== window.rideAccount.user.id) {
      $('idleStatus').textContent='V telefonu je neuložená jízda jiného účtu. Přihlas se k původnímu účtu.';
      return;
    }
    if (log.trips.some(t => t.nativeRideId === ride.id)) {
      acknowledge(ride.id); return;
    }
    if (ride.endedAt == null) {
      previousActiveId = ride.id; selectedId = null;
      if (state.draft && !state.draft.nativeRideId) { renderQueue(); return; }
      // Native recorder owns the complete route, including points collected while JS sleeps.
      state.startedAt = ride.startedAt;
      state.pausedAt = ride.pause?.pausedAtMs ?? null;
      state.pausedMilliseconds = ride.pause?.accumulatedMs || 0;
      state.distanceKm = ride.distanceKm;
      state.route = ride.route;
      state.latestSpeedKmh = Number.isFinite(speedKmh) && speedKmh >= 0 ? speedKmh : 0;
      state.draft = null;
      state.watchId = null;
      $('idlePanel').classList.add('hidden');
      $('finishPanel').classList.add('hidden');
      $('activePanel').classList.remove('hidden');
      $('accuracyValue').textContent = Number.isFinite(accuracyMetres) && accuracyMetres >= 0 ? Math.round(accuracyMetres) : '—';
      const stale = Number.isFinite(lastLocationAtMs) && Date.now() - lastLocationAtMs > 30000;
      if (stale) state.latestSpeedKmh = 0;
      $('gpsStatus').textContent = state.pausedAt != null ? (message || 'Jízda pozastavena. GPS ani doba jízdy se nepřičítají.') : stale
        ? 'Nová GPS poloha nepřišla déle než 30 s. Čekám na signál…'
        : message + (Number.isFinite(lastLocationAtMs) ? ' · poloha v ' + new Date(lastLocationAtMs).toLocaleTimeString('cs-CZ') : '');
      if (!state.timerId) timer();
      renderLive();
    } else {
      selectedId = ride.id; showReview(ride); // Compatibility with build 5 snapshots.
    }
    renderQueue();
  }

  window.__receiveNativeRide = snapshot => { latest = snapshot; apply(); };
  function intercept(id, callback) {
    $(id).addEventListener('click', event => {
      event.preventDefault(); event.stopImmediatePropagation(); callback();
    }, true);
  }
  function install() {
    if (typeof state === 'undefined' || typeof persistLog !== 'function' || !$('startTrip')) {
      setTimeout(install, 250); return;
    }
    const originalRenderLive = renderLive;
    renderLive = function() {
      originalRenderLive();
      if (!state.startedAt || !latest?.ride || latest.ride.endedAt != null) return;
      const fresh = Number.isFinite(latest.lastLocationAtMs) && Date.now() - latest.lastLocationAtMs <= 30000;
      const valid = state.pausedAt == null && fresh && Number.isFinite(latest.speedKmh) && latest.speedKmh >= 0;
      $('speedValue').textContent = valid ? Math.round(latest.speedKmh) : '—';
    };
    intercept('startTrip', () => {
      if (!ready() || pending || state.draft || state.startedAt) return;
      pending = true; $('idleStatus').textContent = 'Žádám o přístup k GPS…';
      send({action: 'start', odometerStart: loadOdometer(), userId: window.rideAccount.user.id});
    });
    if ($('pauseTrip')) intercept('pauseTrip', () => {
      if (!ready() || !latest?.ride || latest.ride.endedAt != null || !owns(latest.ride) || state.draft) return;
      send({action: latest.ride.pause?.pausedAtMs != null ? 'resume' : 'pause'});
    });
    intercept('stopTrip', () => {
      if (!state.startedAt || state.draft) return;
      send({action: 'stop'});
    });
    if ($('nativeAllowBackground')) intercept('nativeAllowBackground', () => send({action: 'requestAlways'}));
    intercept('retryGps', () => { if (latest?.ride?.pause?.pausedAtMs == null) send({action: 'retry'}); });
    intercept('testGps', () => {
      $('gpsTestResult').classList.remove('hidden');
      $('gpsTestResult').textContent = 'Hledám GPS polohu…';
      send({action: 'test'});
    });
    // Both discard buttons already call this global function; clear native storage only on actual discard.
    const originalDiscard = discardDraft;
    discardDraft = function() {
      const id = state.draft?.nativeRideId;
      originalDiscard();
      if (id) { selectedId = null; acknowledge(id, 'discard'); renderQueue(); }
    };
    // Existing listeners captured the old function reference, so intercept confirmed native discards.
    for (const id of ['confirmDiscard']) {
      $(id).addEventListener('click', event => {
        if (!state.draft?.nativeRideId) return;
        event.preventDefault(); event.stopImmediatePropagation(); discardDraft();
      }, true);
    }
    $('backToMain').addEventListener('click', event => {
      if (!state.draft?.nativeRideId) { $('backToMain').textContent = 'Zpět'; return; }
      event.preventDefault(); event.stopImmediatePropagation();
      selectedId = null; originalDiscard(); renderQueue();
    }, true);
    const originalPersist = persistLog;
    persistLog = async function(odometer, trips) {
      const id = state.draft?.nativeRideId;
      const result = await originalPersist(odometer, trips);
      if (result && id && trips.some(t => t.nativeRideId === id)) {
        selectedId = null;
        acknowledge(id); syncContext();
      }
      return result;
    };
    // WKWebView cannot use the browser's blob download flow reliably. Use iOS's share sheet.
    intercept('exportCsv', () => {
      const trips = getTrips();
      if (!trips.length) return alert('Není co exportovat.');
      const rows = [['Datum','Start','Konec','Km','Tachometr start','Tachometr konec','Typ','Odkud','Kam','Poznámka','Tachometr v autě na konci','Naměřeno GPS (km)']];
      for (const trip of trips) {
        const start = new Date(trip.startedAt), end = new Date(trip.endedAt);
        rows.push([start.toLocaleDateString('cs-CZ'), start.toLocaleTimeString('cs-CZ'), end.toLocaleTimeString('cs-CZ'),
          Number(trip.distanceKm).toFixed(3), Number(trip.odometerStart).toFixed(1), Number(trip.odometerEnd).toFixed(1),
          trip.type, trip.from || '', trip.to || '', trip.note || '', Number.isFinite(trip.carOdometerEnd) ? trip.carOdometerEnd.toFixed(3) : '',
          Number.isFinite(trip.gpsDistanceKm) ? trip.gpsDistanceKm.toFixed(3) : '']);
      }
      const exportRows = typeof tripCsvRows === 'function' ? tripCsvRows(trips) : rows;
      const csv = '\ufeff' + exportRows.map(row => row.map(value => '"' + String(value).replaceAll('"','""') + '"').join(';')).join('\n');
      send({action: 'export', csv});
    });
    watchGps = () => send({action: 'retry'});
    $('browserHint').classList.add('hidden');
    setInterval(() => { syncContext(); if (ready()) { apply(); send({action: 'snapshot'}); } }, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) send({action: 'snapshot'}); });
    send({action: 'snapshot'});
  }
  install();
})();
