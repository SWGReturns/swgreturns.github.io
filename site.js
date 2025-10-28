(function(){
  // Tabs
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.note-pane').forEach(p => p.classList.remove('show'));
    document.getElementById(t.dataset.target).classList.add('show');
  }));

  // Load patch notes (cache-busted)
  const bust = '?v=' + (new Date().getTime() % 100000);
  function loadNotes(path, elId){
    fetch(path + bust, {cache:'no-store'})
      .then(r => r.ok ? r.text() : "No notes yet.")
      .then(tx => { document.getElementById(elId).textContent = tx || "No notes yet."; })
      .catch(() => { document.getElementById(elId).textContent = "No notes yet."; });
  }
  loadNotes('patchnotes/precu.txt','precu-content');
})();
