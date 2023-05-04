document.addEventListener('DOMContentLoaded', () => {
  const select = document.getElementById('state');

  chrome.storage.local.get('windowState', (result) => {
    if (result.windowState) {
      select.value = result.windowState;
    }
  });

  select.addEventListener('change', () => {
    const selectedState = select.value;
    chrome.storage.local.set({ 'windowState': selectedState });
  });
});