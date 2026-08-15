'use strict';

/**
 * Editor de imagen mínimo (rotar/recortar/dibujar/texto) para la vista
 * previa de adjuntos -- pedido explícito, 2026-08, viendo el ejemplo real
 * de WhatsApp. Alcance acotado a propósito: sin capas, deshacer, filtros ni
 * stickers -- el canvas ES el bitmap final, cada herramienta pinta directo
 * sobre él (recortar/rotar son la excepción: redimensionan el canvas).
 *
 * API pública: EditorImagen.abrir(file, onGuardar, onCancelar)
 *   onGuardar(nuevoFile) -- se llama con la imagen editada (PNG) al pulsar Listo.
 *   onCancelar() -- se llama al cerrar sin guardar.
 */
const EditorImagen = (() => {
  const COLORES = ['#ffffff', '#000000', '#ff3b30', '#ffcc00', '#34c759', '#0a84ff'];

  let canvas, ctx;
  let herramienta = null; // 'dibujar' | 'recortar' | 'texto' | null
  let colorActual = COLORES[2];
  let nombreArchivoActual = 'imagen-editada.png';
  let callbackGuardar = null;
  let callbackCancelar = null;

  let dibujando = false;
  let ultimoPunto = null;

  let arrastrandoRecorte = false;
  let inicioRecorte = null;
  let seleccionRecorte = null;
  let snapshotAntesRecorte = null;

  function coordenadasEvento(e) {
    const rect = canvas.getBoundingClientRect();
    const punto = e.touches && e.touches[0] ? e.touches[0] : e;
    return {
      x: (punto.clientX - rect.left) * (canvas.width / rect.width),
      y: (punto.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function rotar() {
    const temp = document.createElement('canvas');
    temp.width = canvas.height;
    temp.height = canvas.width;
    const tctx = temp.getContext('2d');
    tctx.translate(temp.width / 2, temp.height / 2);
    tctx.rotate(Math.PI / 2);
    tctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    canvas.width = temp.width;
    canvas.height = temp.height;
    ctx.drawImage(temp, 0, 0);
  }

  function iniciarDibujo(e) {
    if (herramienta !== 'dibujar') return;
    dibujando = true;
    ultimoPunto = coordenadasEvento(e);
  }
  function moverDibujo(e) {
    if (!dibujando) return;
    const p = coordenadasEvento(e);
    ctx.strokeStyle = colorActual;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ultimoPunto.x, ultimoPunto.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimoPunto = p;
  }
  function terminarDibujo() {
    dibujando = false;
  }

  function manejarClicTexto(e) {
    if (herramienta !== 'texto') return;
    const p = coordenadasEvento(e);
    const texto = window.prompt('Texto a agregar:');
    if (!texto) return;
    ctx.fillStyle = colorActual;
    ctx.font = 'bold 28px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(texto, p.x, p.y);
  }

  function iniciarRecorte(e) {
    if (herramienta !== 'recortar') return;
    inicioRecorte = coordenadasEvento(e);
    arrastrandoRecorte = true;
    snapshotAntesRecorte = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  function moverRecorte(e) {
    if (!arrastrandoRecorte) return;
    const p = coordenadasEvento(e);
    ctx.putImageData(snapshotAntesRecorte, 0, 0);
    const x = Math.min(inicioRecorte.x, p.x);
    const y = Math.min(inicioRecorte.y, p.y);
    const w = Math.abs(p.x - inicioRecorte.x);
    const h = Math.abs(p.y - inicioRecorte.y);
    seleccionRecorte = { x, y, w, h };
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
  function terminarRecorte() {
    arrastrandoRecorte = false;
  }
  function aplicarRecorte() {
    if (!seleccionRecorte || seleccionRecorte.w < 5 || seleccionRecorte.h < 5) return;
    ctx.putImageData(snapshotAntesRecorte, 0, 0);
    const datos = ctx.getImageData(seleccionRecorte.x, seleccionRecorte.y, seleccionRecorte.w, seleccionRecorte.h);
    canvas.width = seleccionRecorte.w;
    canvas.height = seleccionRecorte.h;
    ctx.putImageData(datos, 0, 0);
    seleccionRecorte = null;
    snapshotAntesRecorte = null;
    seleccionarHerramienta(null);
  }

  function seleccionarHerramienta(nueva) {
    herramienta = nueva;
    document.querySelectorAll('.herramienta-editor').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.herramienta === nueva);
    });
    const panel = document.getElementById('panel-opciones-editor');
    if (nueva === 'dibujar' || nueva === 'texto') {
      panel.classList.remove('d-none');
      panel.classList.add('d-flex');
      panel.innerHTML = COLORES.map(
        (c) => `<button type="button" class="btn-color-editor rounded-circle" data-color="${c}"
          style="background-color:${c};width:28px;height:28px;border:2px solid ${c === colorActual ? '#fff' : 'transparent'};"></button>`
      ).join('');
      panel.querySelectorAll('.btn-color-editor').forEach((btn) => {
        btn.addEventListener('click', () => {
          colorActual = btn.dataset.color;
          seleccionarHerramienta(nueva);
        });
      });
    } else if (nueva === 'recortar') {
      panel.classList.remove('d-none');
      panel.classList.add('d-flex');
      panel.innerHTML = `<span class="small text-light">Arrastra sobre la imagen para elegir el área</span>
        <button type="button" id="btn-aplicar-recorte" class="btn btn-sm btn-success ms-auto">Aplicar recorte</button>`;
      document.getElementById('btn-aplicar-recorte').addEventListener('click', aplicarRecorte);
    } else {
      panel.classList.add('d-none');
      panel.classList.remove('d-flex');
    }
  }

  function mostrarOverlay(visible) {
    const el = document.getElementById('editor-imagen');
    el.classList.toggle('d-none', !visible);
    el.classList.toggle('d-flex', visible);
  }

  function abrir(file, onGuardar, onCancelar) {
    callbackGuardar = onGuardar;
    callbackCancelar = onCancelar;
    nombreArchivoActual = file.name || 'imagen-editada.png';

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const cont = document.getElementById('lienzo-contenedor');
      const maxW = Math.max(cont.clientWidth - 20, 100);
      const maxH = Math.max(cont.clientHeight - 20, 100);
      const escala = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      canvas.width = Math.round(img.naturalWidth * escala);
      canvas.height = Math.round(img.naturalHeight * escala);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
    };
    img.src = url;

    seleccionarHerramienta(null);
    mostrarOverlay(true);
  }

  function inicializar() {
    canvas = document.getElementById('lienzo-editor');
    ctx = canvas.getContext('2d');

    document.querySelectorAll('.herramienta-editor').forEach((btn) => {
      btn.addEventListener('click', () => {
        const h = btn.dataset.herramienta;
        if (h === 'rotar') {
          rotar();
          return;
        }
        seleccionarHerramienta(herramienta === h ? null : h);
      });
    });

    canvas.addEventListener('mousedown', (e) => { iniciarDibujo(e); iniciarRecorte(e); });
    canvas.addEventListener('mousemove', (e) => { moverDibujo(e); moverRecorte(e); });
    window.addEventListener('mouseup', () => { terminarDibujo(); terminarRecorte(); });
    canvas.addEventListener('click', manejarClicTexto);
    canvas.addEventListener('touchstart', (e) => { iniciarDibujo(e); iniciarRecorte(e); }, { passive: true });
    canvas.addEventListener('touchmove', (e) => { moverDibujo(e); moverRecorte(e); }, { passive: true });
    canvas.addEventListener('touchend', () => { terminarDibujo(); terminarRecorte(); });

    document.getElementById('btn-guardar-edicion').addEventListener('click', () => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const archivo = new File([blob], nombreArchivoActual, { type: 'image/png' });
        mostrarOverlay(false);
        callbackGuardar && callbackGuardar(archivo);
      }, 'image/png');
    });
    document.getElementById('btn-cerrar-editor').addEventListener('click', () => {
      mostrarOverlay(false);
      callbackCancelar && callbackCancelar();
    });
  }

  document.addEventListener('DOMContentLoaded', inicializar);
  if (document.readyState === 'interactive' || document.readyState === 'complete') inicializar();

  return { abrir };
})();
