(() => {
  'use strict';
  const trustedOrigin = 'https://jozi184.github.io';
  if (location.origin !== trustedOrigin || (location.pathname && !location.pathname.startsWith("/kniha-jizd/")) || window.top !== window || !window.webkit?.messageHandlers?.nativeRide) return;
  if (window.__nativeBridgeInstalled) return;
  window.__nativeBridgeInstalled = true;
  const send = body => window.webkit.messageHandlers.nativeRide.postMessage(body);
  let latest = null;
  let pending = false;
  const ready = () => typeof storageReady !== 'undefined' && storageReady && !storageBusy;
  const timer = () => { clearInterval(state.timerId); state.timerId = setInterval(renderLive, 1000); };
  function apply() {
    if (!ready() || !latest || !window.rideAccount?.user) return;
    const {ride, message, speedKmh, accuracyMetres, lastLocationAtMs} = latest;
    pending = false;
    if (!ride) {
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
      send({action: 'saved', id: ride.id}); return;
    }
    if (ride.endedAt == null) {
      // Native recorder owns the complete route, including points collected while JS sleeps.
      state.startedAt = ride.startedAt;
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
      $('gpsStatus').textContent = stale
        ? 'Nová GPS poloha nepřišla déle než 30 s. Čekám na signál…'
        : message + (Number.isFinite(lastLocationAtMs) ? ' · poloha v ' + new Date(lastLocationAtMs).toLocaleTimeString('cs-CZ') : '');
      if (!state.timerId) timer();
      renderLive();
    } else {
      if (state.draft?.nativeRideId === ride.id) return; // Preserve user's corrections and place labels.
      if (state.draft && !state.draft.nativeRideId && state.draft.startedAt !== ride.startedAt) return;
      clearInterval(state.timerId); state.timerId = null;
      state.startedAt = ride.startedAt;
      state.distanceKm = ride.distanceKm;
      state.route = ride.route;
      const odometer = Number.isFinite(ride.odometerStart) ? ride.odometerStart : loadOdometer();
      // Do not copy UUID into the trip's numeric id used by the existing web app.
      state.draft = {nativeRideId: ride.id, startedAt: ride.startedAt, endedAt: ride.endedAt,
        distanceKm: ride.distanceKm, route: ride.route, odometerStart: odometer, odometerEnd: odometer + ride.distanceKm};
      localRemove('activeTrip');
      prepareFinish();
      $('finalDistance').textContent = ride.distanceKm.toFixed(3);
      $('finalOdometer').textContent = formatOdometer(state.draft.odometerEnd);
      $('idlePanel').classList.add('hidden');
      $('activePanel').classList.add('hidden');
      $('finishPanel').classList.remove('hidden');
    }
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
      const valid = fresh && Number.isFinite(latest.speedKmh) && latest.speedKmh >= 0;
      $('speedValue').textContent = valid ? Math.round(latest.speedKmh) : '—';
    };
    intercept('startTrip', () => {
      if (!ready() || pending || state.draft || state.startedAt) return;
      pending = true; $('idleStatus').textContent = 'Žádám o přístup k GPS…';
      send({action: 'start', odometerStart: loadOdometer(), userId: window.rideAccount.user.id});
    });
    intercept('stopTrip', () => {
      if (!state.startedAt || state.draft) return;
      send({action: 'stop'});
    });
    intercept('retryGps', () => send({action: 'retry'}));
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
      if (id) { latest = null; send({action: 'discard', id}); }
    };
    // Existing listeners captured the old function reference, so intercept confirmed native discards.
    for (const id of ['confirmDiscard', 'backToMain']) {
      $(id).addEventListener('click', event => {
        if (!state.draft?.nativeRideId) return;
        event.preventDefault(); event.stopImmediatePropagation(); discardDraft();
      }, true);
    }
    const originalPersist = persistLog;
    persistLog = async function(odometer, trips) {
      const id = state.draft?.nativeRideId;
      const result = await originalPersist(odometer, trips);
      if (result && id && trips.some(t => t.nativeRideId === id)) {
        latest = null;
        send({action: 'saved', id});
      }
      return result;
    };
    // WKWebView cannot use the browser's blob download flow reliably. Use iOS's share sheet.
    intercept('exportCsv', () => {
      const trips = getTrips();
      if (!trips.length) return alert('Není co exportovat.');
      const rows = [['Datum','Start','Konec','Km','Tachometr start','Tachometr konec','Typ','Odkud','Kam','Poznámka']];
      for (const trip of trips) {
        const start = new Date(trip.startedAt), end = new Date(trip.endedAt);
        rows.push([start.toLocaleDateString('cs-CZ'), start.toLocaleTimeString('cs-CZ'), end.toLocaleTimeString('cs-CZ'),
          Number(trip.distanceKm).toFixed(3), Number(trip.odometerStart).toFixed(1), Number(trip.odometerEnd).toFixed(1),
          trip.type, trip.from || '', trip.to || '', trip.note || '']);
      }
      const csv = '\ufeff' + rows.map(row => row.map(value => '"' + String(value).replaceAll('"','""') + '"').join(';')).join('\n');
      send({action: 'export', csv});
    });
    watchGps = () => send({action: 'retry'});
    $('browserHint').classList.add('hidden');
    setInterval(() => { if (ready()) { apply(); send({action: 'snapshot'}); } }, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) send({action: 'snapshot'}); });
    send({action: 'snapshot'});
  }
  install();
})();
