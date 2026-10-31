    // System Clock
    function updateClock() {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      document.getElementById('clock').textContent = `${hours}:${minutes} ${ampm}`;
      
      const options = { weekday: 'short', month: 'short', day: 'numeric' };
      document.getElementById('date').textContent = now.toLocaleDateString('en-US', options);
    }
    setInterval(updateClock, 1000);
    updateClock();

    // Wii Audio Feedback Synthesizer
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playWiiSound(freq = 440, type = 'sine', duration = 0.08) {
      if (window.mirrorQuiet && window.mirrorQuiet()) return;      // music is playing on the Sonos: the mirror stays quiet
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    }

    // Grid State & OpenMote Navigation
    const tiles = Array.from(document.querySelectorAll('.channel-tile'));
    const cols = 3;
    const rows = 4;
    let currentIndex = 0;
    let activeApp = null;

    function setFocus(index) {
      tiles.forEach(tile => tile.classList.remove('focused'));
      if (index >= 0 && index < tiles.length) {
        currentIndex = index;
        tiles[currentIndex].classList.add('focused');
        playWiiSound(520, 'sine', 0.05); // High Wii hover tone
      }
    }

    // OpenMote Key Handling
    window.addEventListener('keydown', (e) => {
      // If inside an active channel overlay
      if (activeApp) {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.key.toLowerCase() === 'b') {
          if (activeApp === 'app-lights' && window.haBack && window.haBack()) return;
          if (activeApp === 'app-pool' && window.poolBack && window.poolBack()) return;
          if (activeApp === 'app-posters' && window.postersBack && window.postersBack()) return;
          if (activeApp === 'app-party' && window.partyBack && window.partyBack()) return;
          if (activeApp === 'app-music' && window.musicBack && window.musicBack()) return;
          if (activeApp === 'app-sports' && window.sportsBack && window.sportsBack()) return;
          if (activeApp === 'app-settings' && window.settingsBack && window.settingsBack()) return;
          // B Button: Back to Wii Menu
          document.querySelectorAll('.app-overlay').forEach(app => app.classList.remove('active'));
          activeApp = null;
          playWiiSound(300, 'triangle', 0.12);
        }
        return;
      }

      // Main Wii Menu D-Pad Navigation
      switch (e.key) {
        case 'ArrowRight':
          // tile 0 is the full-width Now Playing hero; the other tiles are a 3-wide grid starting at index 1
          if (currentIndex >= 1 && (currentIndex - 1) % cols !== cols - 1 && currentIndex + 1 < tiles.length) setFocus(currentIndex + 1);
          break;
        case 'ArrowLeft':
          if (currentIndex >= 1 && (currentIndex - 1) % cols !== 0) setFocus(currentIndex - 1);
          break;
        case 'ArrowDown':
          if (currentIndex === 0) setFocus(2);
          else if (currentIndex + cols < tiles.length) setFocus(currentIndex + cols);
          break;
        case 'ArrowUp':
          if (currentIndex >= 1) setFocus(currentIndex - cols >= 1 ? currentIndex - cols : 0);
          break;
        case 'Enter':
        case ' ':
          // A Button: Open Channel
          const targetAppId = tiles[currentIndex].getAttribute('data-app');
          const targetOverlay = document.getElementById(`app-${targetAppId}`);
          if (targetOverlay) {
            targetOverlay.classList.add('active');
            activeApp = `app-${targetAppId}`;
            playWiiSound(880, 'sine', 0.2); // Wii Channel Launch Chime
          } else {
            playWiiSound(220, 'sawtooth', 0.1); // Empty slot click
          }
          break;
      }
    });

    // Touch support for manual testing
    tiles.forEach((tile, idx) => {
      tile.addEventListener('click', () => {
        setFocus(idx);
        const targetAppId = tile.getAttribute('data-app');
        const targetOverlay = document.getElementById(`app-${targetAppId}`);
        if (targetOverlay) {
          targetOverlay.classList.add('active');
          activeApp = `app-${targetAppId}`;
          playWiiSound(880, 'sine', 0.2);
        }
      });
    });
  
