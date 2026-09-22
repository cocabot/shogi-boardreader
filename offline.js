// Cache only the published app. Selected PDF and record files never leave the device.
const status = document.querySelector('#offlineStatus');
const update = document.querySelector('#updateApp');
if ('serviceWorker' in navigator && window.isSecureContext) {
  let registration;
  let restarting = false;
  const showWaiting = () => {
    if (!registration.waiting) return;
    status.textContent = '更新があります。更新するとPDF・棋譜は開き直しになります。';
    update.hidden = false;
  };
  const watch = worker => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        if (registration.waiting) showWaiting();
      }
      if (worker.state === 'activated') status.textContent = 'オフライン準備完了';
      if (worker.state === 'redundant') status.textContent = '保存できませんでした。通信・空き容量を確認して再読み込みしてください。';
    });
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (restarting) location.reload();
  });
  update.addEventListener('click', event => {
    event.stopPropagation();
    if (!registration?.waiting) return;
    restarting = true;
    update.disabled = true;
    registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
  });
  navigator.serviceWorker.register('./sw.js', {scope:'./', updateViaCache:'none'}).then(reg => {
    registration = reg;
    status.textContent = reg.active ? 'オフライン準備完了' : 'オフライン用データを保存中…（初回のみ）';
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    showWaiting();
  }).catch(() => {
    status.textContent = 'オフライン準備に失敗しました。オンラインで再読み込みしてください。';
  });
} else {
  status.textContent = 'この環境ではオフライン保存を利用できません。Safariで公開サイトを開いてください。';
}
