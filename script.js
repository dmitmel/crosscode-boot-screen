const LOGO_WIDTH = 352;
const LOGO_HEIGHT = 112;

const NW_HAS_DEVTOOLS = process.versions['nw-flavor'] === 'sdk';
/** @type {[string, string][]} */
const BOOT_INTERRUPT_KEYS = [];
if (NW_HAS_DEVTOOLS) {
  BOOT_INTERRUPT_KEYS.push(
    ['F12', 'attach developer tools'],
    ['B', 'interrupt and debug boot sequence'],
  );
}
BOOT_INTERRUPT_KEYS.push(
  ['Alt', 'choose boot configuration'],
  ['S', 'boot in Safe Mode'],
  ['V', 'boot vanilla game'],
  ['Enter', 'resume normal boot sequence'],
  ['Esc', 'poweroff'],
);

const DISABLE_BEEP = location.search.includes('no-beep');
/** @type {OscillatorType} */
const BEEP_WAVE = 'square';
const BEEP_FREQUENCY = 1000; // Hz
const BEEP_VOLUME = 0.25; // ?
const BEEP_DURATION = 0.1; // seconds

// all time values are in seconds
const POWER_ON_DELAY = 0.2;
const BOOT_DELAY = 3.0;
const DEVTOOLS_OPEN_DURATION = 0.5;
const CHAINLOAD_DELAY = 0.2;

const BOOT_VANILLA_GAME_URL = '/assets/node-webkit.html';
const BOOT_CCLOADER_URL = '/ccloader/index.html';

// see https://en.wikipedia.org/wiki/Enhanced_Graphics_Adapter for the color palette

main(document.body);

/**
 * @param {HTMLElement} rootElement
 */
async function main(rootElement) {
  let shouldBeFullscreen = localStorage.getItem('IG_FULLSCREEN') === 'true';
  var nwWindow = nw.Window.get();
  if (nwWindow.isFullscreen !== shouldBeFullscreen) {
    if (shouldBeFullscreen) {
      nwWindow.enterFullscreen();
    } else {
      nwWindow.leaveFullscreen();
    }
  }

  let logoAtlas = await loadImage('/assets/media/gui/title-logo-new.png');

  window.addEventListener('load', () => {
    setTimeout(() => {
      let logo = createLogo(logoAtlas);
      let bootHelp = createBootHelp();
      let bootTimer = createBootTimer();

      rootElement.style.background = 'black';
      rootElement.append(logo, bootHelp, bootTimer);

      rootElement.addEventListener('keyup', handleKey);
    }, POWER_ON_DELAY * 1000);
  });
}

/**
 * @param {KeyboardEvent} event
 */
function handleKey(event) {
  switch (event.code) {
    case 'KeyB': {
      if (NW_HAS_DEVTOOLS) boot({ debug: true });
      break;
    }

    case 'AltLeft':
    case 'AltRight': {
      alert('sorry, custom boot configurations are unsupported right now!');
      poweroff();
      break;
    }

    case 'KeyS': {
      boot({ safe: true });
      break;
    }

    case 'KeyV': {
      boot({ vanilla: true });
      break;
    }

    case 'Enter': {
      boot();
      break;
    }

    case 'Escape': {
      poweroff();
      break;
    }
  }
}

/**
 * @param {CanvasImageSource} logoAtlas
 * @returns {Promise<HTMLElement>}
 */
function createLogo(logoAtlas) {
  let canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.width = LOGO_WIDTH;
  canvas.height = LOGO_HEIGHT;
  canvas.style.position = 'fixed';
  canvas.style.left = '50%';
  canvas.style.top = '50%';
  canvas.style.transform = `translate(-50%, -50%) scale(2)`;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.zIndex = '-1';

  let ctx = canvas.getContext('2d');

  function drawImageCentered(srcX, srcY, sizeX, sizeY) {
    ctx.drawImage(
      logoAtlas,
      srcX,
      srcY,
      sizeX,
      sizeY,
      Math.floor((LOGO_WIDTH - sizeX) / 2),
      Math.floor((LOGO_HEIGHT - sizeY) / 2),
      sizeX,
      sizeY,
    );
  }

  ctx.globalCompositeOperation = 'lighter';
  drawImageCentered(0, LOGO_HEIGHT, LOGO_WIDTH, LOGO_HEIGHT);
  drawImageCentered(0, 0, 288, LOGO_HEIGHT);

  return canvas;
}

/**
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    let img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load image: ${src}`));
  });
}

/**
 * @returns {HTMLElement}
 */
function createBootHelp() {
  let pre = createCodeBlock();
  pre.style.position = 'fixed';
  pre.style.left = '0';
  pre.style.top = '0';

  let maxKeyLength = 0;
  for (let [key] of BOOT_INTERRUPT_KEYS) {
    maxKeyLength = Math.max(maxKeyLength, key.length);
  }

  for (let [key, description] of BOOT_INTERRUPT_KEYS) {
    let keySpan = document.createElement('span');
    keySpan.textContent = `<${key}>`.padStart(maxKeyLength + 2, ' ');
    keySpan.style.color = '#fff';
    pre.append(keySpan, ' ', description, '\n');
  }

  return pre;
}

/** @type {number | null} **/
let bootTimerHandle = null;

/**
 * @returns {HTMLElement}
 */
function createBootTimer() {
  let pre = createCodeBlock();
  pre.style.position = 'fixed';
  pre.style.left = '0';
  pre.style.bottom = '0';

  let span = document.createElement('span');
  span.style.color = '#fff';
  span.textContent = String(BOOT_DELAY);

  pre.append('Booting the default configuration in ', span, ' seconds...');

  /** @type {number | null} */
  let powerOnTime = null;
  bootTimerHandle = requestAnimationFrame(function callback(time) {
    if (powerOnTime == null) powerOnTime = time;

    let timeToBoot = Math.max(0, powerOnTime + BOOT_DELAY * 1000 - time);
    span.textContent = Math.ceil(timeToBoot / 1000).toString();
    if (timeToBoot > 0) bootTimerHandle = requestAnimationFrame(callback);
    else boot();
  });

  return pre;
}

function stopBootTimer() {
  cancelAnimationFrame(bootTimerHandle);
}

/**
 * @returns {HTMLPreElement}
 */
function createCodeBlock() {
  let pre = document.createElement('pre');
  pre.style.margin = '8px';
  pre.style.color = '#aaa';
  pre.style.fontFamily = '"Perfect DOS VGA 437", monospace';
  pre.style.fontSize = '24px';
  return pre;
}

let bootInProgress = false;

/**
 * @param {?{ debug?: boolean, safe?: boolean, vanilla?: boolean }} options
 */
async function boot({ debug, safe, vanilla } = {}) {
  if (bootInProgress) return;
  bootInProgress = true;

  stopBootTimer();
  await beep();
  await wait(CHAINLOAD_DELAY);

  if (debug) {
    await showDevTools();
    await wait(DEVTOOLS_OPEN_DURATION);
    process.env.CROSSCODE_BOOT_DEBUG = '1';
    debugger;
  }

  if (safe) {
    process.env.CROSSCODE_BOOT_SAFE = '1';
  }

  let bootUrl = BOOT_CCLOADER_URL;
  if (vanilla) bootUrl = BOOT_VANILLA_GAME_URL;
  window.location.replace(bootUrl);
}

let audioContext = new AudioContext();
/**
 * @returns {Promise<void>}
 */
async function beep() {
  if (DISABLE_BEEP) return;
  // taken from https://gitlab.com/Dimava/crosscode-translation-ru/-/blob/23d11b134555a3e995197c5ba089e3ede5f6ed71/assets/editor/lib.js#L335-345

  let osc = audioContext.createOscillator();
  osc.type = BEEP_WAVE;
  osc.frequency.value = BEEP_FREQUENCY;

  let gain = audioContext.createGain();
  gain.gain.value = BEEP_VOLUME;

  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + BEEP_DURATION);

  await new Promise((resolve) => {
    osc.addEventListener('ended', () => resolve());
  });
}

function poweroff() {
  stopBootTimer();
  nw.Window.get().close();
}

/**
 * @param {number} seconds
 * @returns {Promise<void>}
 */
function wait(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * @returns {Promise<void>}
 */
function showDevTools() {
  return new Promise((resolve) => nw.Window.get().showDevTools(undefined, resolve));
}
