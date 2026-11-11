'use strict';
/* KR BURGER & PIZZA — frontend público v3, sin dependencias.
   Dos pantallas (categorías / catálogo) con history.pushState + popstate y scroll
   preservado; rueda de categorías sticky; combos con autoplay accesible; "quitar
   ingredientes" por producto; carrito en localStorage y pedido estructurado por
   WhatsApp. Render con createElement/textContent (sin HTML crudo con datos). */
(() => {
  const CLAVE_CARRITO = 'kr-burger-carrito-v1';
  const MAX_CANTIDAD = 99;
  const ID_CATEGORIA_INICIAL = 'hamburguesas';
  const INTERVALO_COMBOS = 4000;
  const MAPA_COLORES = {
    color_fondo: '--fondo',
    color_acento: '--acento',
    color_texto: '--texto',
    color_panel: '--panel',
    color_verde: '--verde'
  };
  const CLAVE_INSTALAR = 'kr-burger-instalar-oculto';
  const formateador = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
  const estado = {
    menu: null,
    config: null,
    categorias: [],
    combos: [],
    lineas: [],
    producto: null,
    categoriaActiva: null,
    pantalla: 'categorias',
    scrollCategorias: 0,
    scrollModal: null,
    historialCatalogo: false,
    comboTimer: null,
    comboIndice: 0,
    comboPausado: false,
    ruedaCentrando: false,
    ruedaCentradoTimer: null,
    ruedaScrollTimer: null,
    temporizadorToast: null
  };

  // ---------- Utilidades de DOM ----------
  const $ = (id) => document.getElementById(id);

  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined && texto !== null) nodo.textContent = texto;
    return nodo;
  }

  function boton(clase, texto, etiquetaAria) {
    const nodo = el('button', clase, texto);
    nodo.type = 'button';
    if (etiquetaAria) nodo.setAttribute('aria-label', etiquetaAria);
    return nodo;
  }

  function imagen(clase, ruta, alt, cargaDiferida) {
    const nodo = document.createElement('img');
    if (clase) nodo.className = clase;
    const resuelta = rutaImagen(ruta);
    if (resuelta) nodo.src = resuelta;
    nodo.alt = alt || '';
    nodo.decoding = 'async';
    if (cargaDiferida) nodo.loading = 'lazy';
    return nodo;
  }

  // Los paths del contrato ("/assets/...") se resuelven relativos a la carpeta
  // pública: funciona tanto si public/ es la raíz del sitio como si no.
  function rutaImagen(ruta) {
    if (typeof ruta !== 'string' || !ruta.trim()) return '';
    return new URL(ruta.trim().replace(/^\/+/, ''), document.baseURI).href;
  }

  function urlSegura(valor) {
    if (typeof valor !== 'string') return '';
    const limpio = valor.trim();
    return /^https?:\/\//i.test(limpio) ? limpio : '';
  }

  function gs(valor) {
    return `${moneda()} ${formateador.format(Number(valor) || 0)}`;
  }

  function moneda() {
    if (estado.config && typeof estado.config.moneda === 'string' && estado.config.moneda.trim()) {
      return estado.config.moneda.trim();
    }
    const negocio = estado.menu && estado.menu.negocio;
    return (negocio && negocio.moneda) || 'Gs';
  }

  function prefiereMenosMovimiento() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function mostrarToast(texto) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = texto;
    toast.hidden = false;
    clearTimeout(estado.temporizadorToast);
    estado.temporizadorToast = setTimeout(() => {
      toast.hidden = true;
    }, 3500);
  }

  // Respaldo del logo: si el logo real no carga, se usa el ícono PNG oficial.
  // No se modifica el asset: solo se muestra el alternativo.
  function repararLogo(logo) {
    if (!logo) return;
    const respaldo = rutaImagen('/assets/ui/icono-512.png');
    logo.addEventListener('error', () => {
      if (logo.src !== respaldo) logo.src = respaldo;
    });
    if (logo.complete && logo.naturalWidth === 0 && logo.src !== respaldo) {
      logo.src = respaldo;
    }
  }

  // ---------- Carga de datos ----------
  async function cargarJson(ruta) {
    const respuesta = await fetch(ruta, { cache: 'no-store' });
    if (!respuesta.ok) throw new Error(`No se pudo cargar ${ruta} (${respuesta.status})`);
    return respuesta.json();
  }

  async function iniciar() {
    conectarEventosBase();
    const resultados = await Promise.allSettled([
      cargarJson('data/menu.json'),
      cargarJson('data/config.json')
    ]);
    registrarServiceWorker();
    if (resultados[0].status === 'rejected') {
      mostrarError();
      return;
    }
    estado.menu = resultados[0].value;
    estado.config = resultados[1].status === 'fulfilled' ? resultados[1].value : null;
    aplicarColores(estado.config);
    actualizarTextosNegocio();
    construirCategorias();
    renderCombos();
    iniciarCombos();
    renderCategorias();
    renderRueda();
    renderUbicacion();
    cargarCarrito();
    const inicial =
      estado.categorias.find((categoria) => categoria.id === ID_CATEGORIA_INICIAL) || estado.categorias[0];
    if (inicial) {
      renderPanelCategoria(inicial.id);
      marcarCategoriaActiva(inicial.id);
      actualizarRueda(inicial.id);
    }
    actualizarCarritoUI();
    ocultarCarga();
  }

  function aplicarColores(config) {
    if (!config) return;
    const raiz = document.documentElement;
    const calculado = getComputedStyle(raiz);
    for (const [clave, variable] of Object.entries(MAPA_COLORES)) {
      const valor = config[clave];
      if (typeof valor !== 'string' || !valor.trim()) continue;
      if (valor.trim() !== calculado.getPropertyValue(variable).trim()) {
        raiz.style.setProperty(variable, valor.trim());
      }
    }
    const metaTema = document.querySelector('meta[name="theme-color"]');
    if (metaTema && typeof config.color_acento === 'string' && config.color_acento.trim()) {
      metaTema.setAttribute('content', config.color_acento.trim());
    }
  }

  function actualizarTextosNegocio() {
    const negocio = (estado.menu && estado.menu.negocio) || {};
    const config = estado.config || {};
    const nombre = config.nombre || negocio.nombre || 'KR BURGER & PIZZA';
    const nombreCabecera = $('negocio-nombre');
    const taglineCabecera = $('negocio-tagline');
    const horarioPortada = $('portada-horario');
    if (nombreCabecera) nombreCabecera.textContent = nombre;
    if (taglineCabecera && negocio.tagline) taglineCabecera.textContent = negocio.tagline;
    if (horarioPortada && negocio.horario) horarioPortada.textContent = negocio.horario;
    document.title = `${nombre} · Pedidos por WhatsApp`;
  }

  function renderUbicacion() {
    const negocio = (estado.menu && estado.menu.negocio) || {};
    const ubicacion = negocio.ubicacion || {};
    const asignar = (id, texto) => {
      const nodo = $(id);
      if (nodo && texto) nodo.textContent = texto;
    };
    asignar('ubicacion-direccion', ubicacion.direccion || negocio.direccion);
    asignar('pie-horario', negocio.horario);
    const enlace = $('link-mapa');
    const url = urlSegura(ubicacion.mapa_url);
    if (enlace) {
      if (url) {
        enlace.href = url;
        enlace.hidden = false;
      } else {
        enlace.hidden = true;
      }
    }
  }

  function mostrarError() {
    for (const id of ['cargando-catalogo', 'pantalla-categorias', 'pantalla-catalogo']) {
      const nodo = $(id);
      if (nodo) nodo.hidden = true;
    }
    const error = $('error-catalogo');
    if (error) error.hidden = false;
  }

  function ocultarCarga() {
    const carga = $('cargando-catalogo');
    if (carga) carga.hidden = true;
  }

  // ---------- Pantallas + historial ----------
  function mostrarPantalla(nombre) {
    const categorias = $('pantalla-categorias');
    const catalogo = $('pantalla-catalogo');
    if (!categorias || !catalogo) return;
    const verCategorias = nombre === 'categorias';
    categorias.hidden = !verCategorias;
    categorias.setAttribute('aria-hidden', String(!verCategorias));
    catalogo.hidden = verCategorias;
    catalogo.setAttribute('aria-hidden', String(verCategorias));
    const visible = verCategorias ? categorias : catalogo;
    visible.classList.remove('entrando');
    void visible.offsetWidth; // reinicia la animación fade
    visible.classList.add('entrando');
    estado.pantalla = nombre;
  }

  function abrirCatalogo(idCategoria) {
    const categoria = estado.categorias.find((item) => item.id === idCategoria);
    if (!categoria) return;
    const yaEnCatalogo = estado.pantalla === 'catalogo';
    const scrollActual = window.scrollY;
    if (!yaEnCatalogo) {
      estado.scrollCategorias = scrollActual;
      if (!estado.historialCatalogo) {
        try {
          history.pushState({ krVista: 'catalogo', categoria: categoria.id }, '');
          estado.historialCatalogo = true;
        } catch (error) {
          // Sin History API seguimos funcionando, solo sin botón atrás propio.
        }
      }
    }
    renderPanelCategoria(categoria.id);
    marcarCategoriaActiva(categoria.id);
    actualizarRueda(categoria.id);
    if (!yaEnCatalogo) {
      mostrarPantalla('catalogo');
      window.scrollTo({ top: 0, behavior: 'auto' });
      const volver = $('volver-categorias');
      if (volver) volver.focus({ preventScroll: true });
    } else {
      // Cambio de categoría desde la rueda: el grid se actualiza sin saltar al top.
      window.scrollTo({ top: scrollActual, behavior: 'auto' });
    }
    centrarRueda(categoria.id);
  }

  function salirCatalogo() {
    estado.historialCatalogo = false;
    mostrarPantalla('categorias');
    window.scrollTo({ top: estado.scrollCategorias, behavior: 'auto' });
    const tile = estado.categoriaActiva ? $('tab-' + estado.categoriaActiva) : null;
    if (tile) tile.focus({ preventScroll: true });
  }

  function volverCategorias() {
    if (estado.pantalla !== 'catalogo') return;
    if (estado.historialCatalogo) {
      try {
        history.back();
        return;
      } catch (error) {
        // fallback abajo
      }
    }
    salirCatalogo();
  }

  function conectarHistorial() {
    window.addEventListener('popstate', () => {
      const dialogo = $('dialogo-producto');
      if (dialogo && dialogo.open) cerrarDialogo(dialogo);
      if (estado.pantalla === 'catalogo') salirCatalogo();
    });
  }

  // ---------- Datos del menú ----------
  function construirCategorias() {
    const menu = estado.menu || {};
    const categorias = [];
    for (const categoria of Array.isArray(menu.categorias) ? menu.categorias : []) {
      if (!categoria || typeof categoria.id !== 'string') continue;
      const items = Array.isArray(categoria.items) ? categoria.items : [];
      for (const item of items) {
        if (item && typeof item === 'object') item.categoria = categoria.id;
      }
      categorias.push({
        id: categoria.id,
        nombre: categoria.nombre || categoria.id,
        icono: typeof categoria.icono === 'string' ? categoria.icono : items[0] && items[0].imagen,
        aviso: typeof categoria.aviso === 'string' ? categoria.aviso : '',
        items
      });
    }
    estado.categorias = categorias;
    estado.combos = [];
    for (const combo of Array.isArray(menu.combos) ? menu.combos : []) {
      if (!combo || typeof combo.id !== 'string') continue;
      estado.combos.push(Object.assign({}, combo, { tipo: 'combo', extras: [] }));
    }
  }

  function buscarProducto(idProducto) {
    for (const categoria of estado.categorias) {
      const encontrado = categoria.items.find((item) => item && item.id === idProducto);
      if (encontrado) return encontrado;
    }
    return estado.combos.find((combo) => combo && combo.id === idProducto) || null;
  }

  function buscarExtra(idExtra) {
    const extras = estado.menu && Array.isArray(estado.menu.extras) ? estado.menu.extras : [];
    return extras.find((extra) => extra && extra.id === idExtra) || null;
  }

  function categoriaDeProducto(idProducto) {
    for (const categoria of estado.categorias) {
      if (categoria.items.some((item) => item && item.id === idProducto)) return categoria.id;
    }
    return null;
  }

  // Encuadre por categoría: las botellas suben un poco (tapa con poco aire arriba);
  // las pizzas bajan un poco para no cortar el disco.
  const POSICION_IMAGEN = {
    bebidas: '50% 28%',
    cervezas: '50% 28%',
    pizzas: '50% 35%'
  };

  function posicionImagen(item) {
    if (!item) return '50% 50%';
    const categoria = item.categoria || categoriaDeProducto(item.id);
    return POSICION_IMAGEN[categoria] || '50% 50%';
  }

  function resumenIncluye(combo) {
    return nombresIncluye(combo).join(' + ');
  }

  function nombresIncluye(combo) {
    const ids = Array.isArray(combo.incluye) ? combo.incluye : [];
    return ids
      .map((idProducto) => buscarProducto(idProducto))
      .filter(Boolean)
      .map((producto) => producto.nombre);
  }

  // ---------- Combos destacados con autoplay ----------
  function renderCombos() {
    const carrusel = $('carrusel-combos');
    if (!carrusel) return;
    carrusel.replaceChildren();
    for (const combo of estado.combos) carrusel.appendChild(crearComboCard(combo));
    renderPuntosCombos();
  }

  // Puntos debajo del carrusel: indican en qué combo estamos y permiten ir a otro.
  function renderPuntosCombos() {
    const contenedor = $('combos-puntos');
    if (!contenedor) return;
    contenedor.replaceChildren();
    estado.combos.forEach((combo, indice) => {
      const punto = boton('punto-combo', '', `Ir al combo ${indice + 1}: ${combo.nombre}`);
      punto.type = 'button';
      punto.dataset.indice = String(indice);
      if (indice === estado.comboIndice) punto.setAttribute('aria-current', 'true');
      contenedor.appendChild(punto);
    });
  }

  function actualizarPuntosCombos(indice) {
    const contenedor = $('combos-puntos');
    if (!contenedor) return;
    [...contenedor.children].forEach((punto, posicion) => {
      if (posicion === indice) punto.setAttribute('aria-current', 'true');
      else punto.removeAttribute('aria-current');
    });
  }

  function irAlCombo(indice) {
    const total = estado.combos.length;
    if (!total) return;
    estado.comboIndice = ((indice % total) + total) % total;
    desplazarCombo(estado.comboIndice);
    actualizarPuntosCombos(estado.comboIndice);
  }

  function crearComboCard(combo) {
    const tarjeta = boton('combo-card', '');
    tarjeta.disabled = Boolean(combo.agotado);
    tarjeta.setAttribute('aria-label', `Ver ${combo.nombre}`);

    const figura = el('div', 'combo-figura');
    figura.appendChild(imagen('', combo.imagen, combo.nombre, true));
    if (combo.agotado) figura.appendChild(el('span', 'tarjeta-sello', 'Agotado'));

    const cuerpo = el('div', 'combo-cuerpo');
    cuerpo.appendChild(el('h3', 'combo-nombre', combo.nombre));
    if (combo.descripcion) cuerpo.appendChild(el('p', 'combo-incluye', combo.descripcion));
    if (combo.destacado) {
      const badges = el('div', 'badges');
      badges.appendChild(el('span', 'badge badge-destacado', 'Destacado'));
      cuerpo.appendChild(badges);
    }
    cuerpo.appendChild(el('p', 'combo-precio', gs(combo.precio)));

    tarjeta.append(figura, cuerpo);
    tarjeta.addEventListener('click', () => abrirProducto(combo));
    return tarjeta;
  }

  function pasoCombos(carrusel) {
    const primera = carrusel && carrusel.children[0];
    if (!primera) return 0;
    const estilo = getComputedStyle(carrusel);
    const separacion = parseFloat(estilo.columnGap || estilo.gap) || 0;
    return primera.getBoundingClientRect().width + separacion;
  }

  function desplazarCombo(indice) {
    const carrusel = $('carrusel-combos');
    if (!carrusel) return;
    const paso = pasoCombos(carrusel);
    if (!paso) return;
    const maximo = Math.max(0, carrusel.scrollWidth - carrusel.clientWidth);
    const destino = Math.min(Math.max(0, indice * paso), maximo);
    carrusel.scrollTo({
      left: destino,
      behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth'
    });
    actualizarPuntosCombos(indice);
  }

  function avanzarCombo(paso) {
    const total = estado.combos.length;
    if (total < 2) return;
    estado.comboIndice = (estado.comboIndice + paso + total) % total;
    desplazarCombo(estado.comboIndice);
  }

  function reiniciarAutoplay() {
    clearInterval(estado.comboTimer);
    estado.comboTimer = null;
    if (prefiereMenosMovimiento() || estado.combos.length < 2) return;
    estado.comboTimer = setInterval(() => {
      if (estado.comboPausado || document.hidden) return;
      avanzarCombo(1);
    }, INTERVALO_COMBOS);
  }

  function iniciarCombos() {
    const carrusel = $('carrusel-combos');
    if (!carrusel) return;
    const pausar = () => {
      estado.comboPausado = true;
    };
    const reanudar = () => {
      estado.comboPausado = false;
    };
    const puntos = $('combos-puntos');
    if (puntos) {
      puntos.addEventListener('click', (evento) => {
        const punto = evento.target.closest('.punto-combo');
        if (!punto) return;
        const indice = Number(punto.dataset.indice);
        if (!Number.isFinite(indice)) return;
        irAlCombo(indice);
        reiniciarAutoplay();
      });
    }
    carrusel.addEventListener('keydown', (evento) => {
      if (evento.key === 'ArrowRight') {
        evento.preventDefault();
        avanzarCombo(1);
        reiniciarAutoplay();
      } else if (evento.key === 'ArrowLeft') {
        evento.preventDefault();
        avanzarCombo(-1);
        reiniciarAutoplay();
      }
    });
    carrusel.addEventListener('mouseenter', pausar);
    carrusel.addEventListener('mouseleave', reanudar);
    carrusel.addEventListener('focusin', pausar);
    carrusel.addEventListener('focusout', (evento) => {
      if (!carrusel.contains(evento.relatedTarget)) reanudar();
    });
    carrusel.addEventListener('touchstart', pausar, { passive: true });
    carrusel.addEventListener('touchend', reanudar, { passive: true });
    carrusel.addEventListener('pointerdown', pausar);
    carrusel.addEventListener('pointerup', reanudar);

    // Arrastrar con el mouse en escritorio (en el teléfono ya se desliza con el dedo).
    let arrastrando = false;
    let inicioX = 0;
    let inicioScroll = 0;
    let movido = false;
    let suprimirClick = false;
    let temporizadorSuprimir = null;
    carrusel.addEventListener('pointerdown', (evento) => {
      if (evento.pointerType !== 'mouse') return;
      arrastrando = true;
      movido = false;
      inicioX = evento.clientX;
      inicioScroll = carrusel.scrollLeft;
      carrusel.classList.add('arrastrando');
      if (carrusel.setPointerCapture) {
        try {
          carrusel.setPointerCapture(evento.pointerId);
        } catch (error) {
          // Si el navegador no permite capturar, seguimos igual.
        }
      }
    });
    carrusel.addEventListener('pointermove', (evento) => {
      if (!arrastrando) return;
      const desplazamiento = evento.clientX - inicioX;
      if (Math.abs(desplazamiento) > 6) movido = true;
      carrusel.scrollLeft = inicioScroll - desplazamiento;
    });
    const terminarArrastre = (evento) => {
      if (!arrastrando) return;
      arrastrando = false;
      carrusel.classList.remove('arrastrando');
      if (carrusel.releasePointerCapture && evento.pointerId !== undefined) {
        try {
          carrusel.releasePointerCapture(evento.pointerId);
        } catch (error) {
          // Sin captura previa: no pasa nada.
        }
      }
      if (movido) {
        suprimirClick = true;
        clearTimeout(temporizadorSuprimir);
        temporizadorSuprimir = setTimeout(() => {
          suprimirClick = false;
        }, 0);
      }
    };
    carrusel.addEventListener('pointerup', terminarArrastre);
    carrusel.addEventListener('pointercancel', terminarArrastre);
    carrusel.addEventListener(
      'click',
      (evento) => {
        if (!suprimirClick) return;
        evento.preventDefault();
        evento.stopPropagation();
        suprimirClick = false;
      },
      true
    );

    // Sincroniza el índice y los puntos cuando el usuario desliza a mano (una tarjeta por paso).
    let temporizadorDesliz = null;
    carrusel.addEventListener('scroll', () => {
      clearTimeout(temporizadorDesliz);
      temporizadorDesliz = setTimeout(() => {
        const paso = pasoCombos(carrusel);
        if (!paso || !estado.combos.length) return;
        estado.comboIndice = Math.round(carrusel.scrollLeft / paso) % estado.combos.length;
        actualizarPuntosCombos(estado.comboIndice);
      }, 140);
    });
    reiniciarAutoplay();
  }

  // ---------- Pantalla 1: categorías (tablist de tiles) ----------
  function renderCategorias() {
    const nav = $('nav-categorias');
    const contenedorPaneles = $('paneles-productos');
    if (!nav || !contenedorPaneles) return;
    nav.replaceChildren();
    contenedorPaneles.replaceChildren();
    for (const categoria of estado.categorias) {
      const tile = boton('categoria-tile', '');
      tile.id = `tab-${categoria.id}`;
      tile.setAttribute('role', 'tab');
      tile.setAttribute('aria-selected', 'false');
      tile.setAttribute('aria-controls', `panel-${categoria.id}`);
      tile.tabIndex = -1;
      const icono = imagen('categoria-icono', categoria.icono, '', true);
      const info = el('span', 'categoria-info');
      info.appendChild(el('span', 'categoria-nombre', categoria.nombre));
      const cantidad = categoria.items.length;
      info.appendChild(
        el('span', 'categoria-cantidad', cantidad === 1 ? '1 producto' : `${cantidad} productos`)
      );
      tile.append(icono, info);
      tile.addEventListener('click', () => abrirCatalogo(categoria.id));
      tile.addEventListener('keydown', (evento) => moverFocoTabs(evento, categoria.id));
      nav.appendChild(tile);

      const panel = el('div', 'panel-productos');
      panel.id = `panel-${categoria.id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `tab-${categoria.id}`);
      panel.hidden = true;
      panel.appendChild(el('div', 'grilla'));
      contenedorPaneles.appendChild(panel);
    }
  }

  function marcarCategoriaActiva(idCategoria) {
    estado.categoriaActiva = idCategoria;
    for (const categoria of estado.categorias) {
      const tile = $('tab-' + categoria.id);
      if (!tile) continue;
      const activa = categoria.id === idCategoria;
      tile.setAttribute('aria-selected', String(activa));
      tile.tabIndex = activa ? 0 : -1;
    }
  }

  function moverFocoTabs(evento, idCategoria) {
    const teclas = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 2,
      ArrowUp: -2,
      Home: 'inicio',
      End: 'fin'
    };
    if (!(evento.key in teclas)) return;
    evento.preventDefault();
    const total = estado.categorias.length;
    const indice = estado.categorias.findIndex((categoria) => categoria.id === idCategoria);
    if (indice < 0 || total === 0) return;
    let destino = indice;
    const paso = teclas[evento.key];
    if (paso === 'inicio') destino = 0;
    else if (paso === 'fin') destino = total - 1;
    else destino = (indice + paso + total) % total;
    const objetivo = estado.categorias[destino];
    if (!objetivo) return;
    const tile = $('tab-' + objetivo.id);
    if (tile) tile.focus();
  }

  // ---------- Rueda de categorías (catálogo) ----------
  function renderRueda() {
    const pista = $('rueda-pista');
    if (!pista) return;
    pista.replaceChildren();
    for (const categoria of estado.categorias) {
      const item = boton('rueda-item', '');
      item.dataset.id = categoria.id;
      item.setAttribute('aria-current', 'false');
      item.appendChild(imagen('rueda-icono', categoria.icono, '', true));
      item.appendChild(el('span', 'rueda-nombre', categoria.nombre));
      item.addEventListener('click', () => abrirCatalogo(categoria.id));
      pista.appendChild(item);
    }
    conectarRueda(pista);
  }

  function actualizarRueda(idCategoria) {
    const pista = $('rueda-pista');
    if (!pista) return;
    for (const item of pista.querySelectorAll('.rueda-item')) {
      item.setAttribute('aria-current', String(item.dataset.id === idCategoria));
    }
  }

  function centrarRueda(idCategoria) {
    const pista = $('rueda-pista');
    if (!pista) return;
    const item = pista.querySelector(`.rueda-item[data-id="${idCategoria}"]`);
    if (!item) return;
    if (estado.pantalla !== 'catalogo') return;
    estado.ruedaCentrando = true;
    const izquierda = item.offsetLeft - pista.offsetLeft;
    const destino = Math.max(0, izquierda - (pista.clientWidth - item.offsetWidth) / 2);
    const maximo = Math.max(0, pista.scrollWidth - pista.clientWidth);
    pista.scrollTo({
      left: Math.min(destino, maximo),
      behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth'
    });
    clearTimeout(estado.ruedaCentradoTimer);
    estado.ruedaCentradoTimer = setTimeout(() => {
      estado.ruedaCentrando = false;
    }, 500);
  }

  function conectarRueda(pista) {
    pista.addEventListener('scroll', () => {
      clearTimeout(estado.ruedaScrollTimer);
      estado.ruedaScrollTimer = setTimeout(() => {
        if (estado.ruedaCentrando || estado.pantalla !== 'catalogo') return;
        const centro = pista.scrollLeft + pista.clientWidth / 2;
        let mejorId = null;
        let mejorDistancia = Infinity;
        for (const item of pista.querySelectorAll('.rueda-item')) {
          const itemCentro = item.offsetLeft - pista.offsetLeft + item.offsetWidth / 2;
          const distancia = Math.abs(itemCentro - centro);
          if (distancia < mejorDistancia) {
            mejorDistancia = distancia;
            mejorId = item.dataset.id;
          }
        }
        if (mejorId && mejorId !== estado.categoriaActiva) abrirCatalogo(mejorId);
      }, 160);
    });
    pista.addEventListener('keydown', (evento) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(evento.key)) return;
      evento.preventDefault();
      const total = estado.categorias.length;
      if (total === 0) return;
      const indice = estado.categorias.findIndex((categoria) => categoria.id === estado.categoriaActiva);
      let destino = indice < 0 ? 0 : indice;
      if (evento.key === 'ArrowRight') destino = (destino + 1) % total;
      if (evento.key === 'ArrowLeft') destino = (destino - 1 + total) % total;
      if (evento.key === 'Home') destino = 0;
      if (evento.key === 'End') destino = total - 1;
      const objetivo = estado.categorias[destino];
      if (!objetivo) return;
      abrirCatalogo(objetivo.id);
      const item = pista.querySelector(`.rueda-item[data-id="${objetivo.id}"]`);
      if (item) item.focus({ preventScroll: true });
    });
  }

  function renderPanelCategoria(idCategoria) {
    const categoria = estado.categorias.find((item) => item.id === idCategoria);
    if (!categoria) return;
    for (const otra of estado.categorias) {
      const panel = $('panel-' + otra.id);
      if (panel) panel.hidden = otra.id !== categoria.id;
    }
    const panelActivo = $('panel-' + categoria.id);
    if (!panelActivo) return;
    const grilla = panelActivo.querySelector('.grilla');
    if (!grilla) return;
    grilla.replaceChildren();
    categoria.items.forEach((item, indice) => {
      if (!item || typeof item.id !== 'string') return;
      grilla.appendChild(crearTarjeta(item, indice));
    });
    const titulo = $('titulo-productos');
    if (titulo) titulo.textContent = categoria.nombre;
    const aviso = $('aviso-alcohol');
    if (aviso) {
      const hayAlcohol = categoria.items.some((item) => item && item.alcohol);
      const texto = categoria.aviso || (hayAlcohol ? 'Venta de alcohol solo a mayores de 18 años' : '');
      aviso.textContent = texto;
      aviso.hidden = !texto;
    }
  }

  // ---------- Tarjetas de producto ----------
  function crearTarjeta(item, indice) {
    const articulo = el('article', 'tarjeta');
    if (item.agotado) articulo.classList.add('agotada');
    articulo.dataset.id = item.id;
    articulo.style.setProperty('--i', String(Math.min(indice, 12)));

    const abrir = el('button', 'tarjeta-abrir');
    abrir.type = 'button';
    abrir.disabled = Boolean(item.agotado);
    abrir.setAttribute(
      'aria-label',
      item.agotado ? `${item.nombre} (agotado)` : `Ver y personalizar ${item.nombre}`
    );

    const figura = el('div', 'tarjeta-figura');
    figura.style.setProperty('--pos-imagen', posicionImagen(item));
    const foto = imagen('', item.imagen, item.nombre, true);
    foto.width = 512;
    foto.height = 512;
    figura.appendChild(foto);
    if (item.alcohol) figura.appendChild(el('span', 'badge badge-18', '18+'));
    if (item.agotado) figura.appendChild(el('span', 'tarjeta-sello', 'Agotado'));

    const cuerpo = el('div', 'tarjeta-cuerpo');
    cuerpo.appendChild(el('h3', 'tarjeta-nombre', item.nombre));
    if (item.descripcion) cuerpo.appendChild(el('p', 'tarjeta-descripcion', item.descripcion));

    const badges = el('div', 'badges');
    if (item.destacado) badges.appendChild(el('span', 'badge badge-destacado', 'Destacado'));
    if (item.agotado) badges.appendChild(el('span', 'badge badge-agotado', 'Agotado'));
    if (badges.childElementCount) cuerpo.appendChild(badges);

    const pie = el('div', 'tarjeta-pie');
    pie.appendChild(el('p', 'precio', gs(item.precio)));
    cuerpo.appendChild(pie);

    abrir.append(figura, cuerpo);
    abrir.addEventListener('click', () => abrirProducto(item));

    // "+" = agregar directo con la configuración base. La ficha (tocar la imagen)
    // queda para personalizar: borde, ingredientes, extras o cantidad.
    const mas = boton(
      'tarjeta-mas',
      '+',
      item.agotado ? `${item.nombre} (agotado)` : `Agregar ${item.nombre} al carrito`
    );
    mas.disabled = Boolean(item.agotado);
    mas.addEventListener('click', () => agregarDirecto(item));

    articulo.append(abrir, mas);
    return articulo;
  }

  // ---------- Diálogo de producto ----------
  function abrirProducto(item) {
    if (!item || item.agotado) return;
    estado.producto = {
      item,
      cantidad: 1,
      borde: false,
      extras: new Set(),
      sin: new Set()
    };
    estado.scrollModal = window.scrollY;
    const dialogo = $('dialogo-producto');
    const foto = $('dp-imagen');
    if (foto) {
      const resuelta = rutaImagen(item.imagen);
      if (resuelta) foto.src = resuelta;
      foto.alt = item.nombre;
      foto.style.setProperty('--pos-imagen', posicionImagen(item));
    }
    if ($('dp-titulo')) $('dp-titulo').textContent = item.nombre;
    const esCombo = item.tipo === 'combo';
    const descripcion = $('dp-descripcion');
    if (descripcion) {
      // En combos la lista "Incluye" ya resume el contenido: no duplicamos la descripción.
      descripcion.textContent = esCombo ? '' : item.descripcion || '';
      descripcion.hidden = esCombo || !item.descripcion;
    }
    const esAlcohol = Boolean(item.alcohol);
    const badge18 = $('dp-badge-18');
    if (badge18) badge18.hidden = !esAlcohol;
    const avisoAlcohol = $('dp-alcohol');
    if (avisoAlcohol) avisoAlcohol.hidden = !esAlcohol;
    construirOpcionesProducto(item);
    const cuerpoModal = $('dp-cuerpo');
    if (cuerpoModal) cuerpoModal.scrollTop = 0;
    if ($('dp-cantidad')) $('dp-cantidad').textContent = '1';
    actualizarTotalProducto();
    abrirDialogo(dialogo);
  }

  function construirOpcionesProducto(item) {
    const contenedor = $('dp-opciones');
    if (!contenedor) return;
    contenedor.replaceChildren();
    let hayOpciones = false;

    const precioBorde = Number(item.precio_con_borde);
    if (Number.isFinite(precioBorde) && precioBorde > Number(item.precio)) {
      const grupo = fieldset('Borde');
      grupo.appendChild(crearOpcionRadio('opcion-borde-sin', 'borde', 'sin-borde', 'Sin borde', '', true));
      grupo.appendChild(
        crearOpcionRadio(
          'opcion-borde-con',
          'borde',
          'con-borde',
          'Con borde',
          '+' + gs(precioBorde - Number(item.precio)),
          false
        )
      );
      contenedor.appendChild(grupo);
      hayOpciones = true;
    }

    const ingredientes = Array.isArray(item.ingredientes) ? item.ingredientes : [];
    if (ingredientes.length) {
      const grupo = fieldset('Quitar ingredientes');
      const chips = el('div', 'sin-chips');
      for (const nombreIngrediente of ingredientes) {
        const chip = boton('sin-chip', nombreIngrediente, `Quitar ${nombreIngrediente}`);
        chip.setAttribute('aria-pressed', 'false');
        chip.addEventListener('click', () => {
          if (!estado.producto) return;
          const activo = chip.getAttribute('aria-pressed') === 'true';
          chip.setAttribute('aria-pressed', String(!activo));
          if (activo) estado.producto.sin.delete(nombreIngrediente);
          else estado.producto.sin.add(nombreIngrediente);
        });
        chips.appendChild(chip);
      }
      grupo.appendChild(chips);
      contenedor.appendChild(grupo);
      hayOpciones = true;
    }

    const extras = Array.isArray(item.extras) ? item.extras : [];
    if (extras.length) {
      const grupo = fieldset('Extras');
      grupo.classList.add('grupo-extras');
      for (const idExtra of extras) {
        const extra = buscarExtra(idExtra);
        if (!extra) continue;
        const opcion = el('label', 'opcion opcion-tile');
        const casilla = document.createElement('input');
        casilla.type = 'checkbox';
        casilla.value = extra.id;
        casilla.id = `extra-${extra.id}`;
        casilla.addEventListener('change', () => {
          if (!estado.producto) return;
          if (casilla.checked) estado.producto.extras.add(extra.id);
          else estado.producto.extras.delete(extra.id);
          actualizarTotalProducto();
        });
        opcion.appendChild(casilla);
        opcion.appendChild(el('span', 'opcion-tile-nombre', extra.nombre));
        opcion.appendChild(el('span', 'opcion-precio', '+' + gs(extra.precio)));
        grupo.appendChild(opcion);
      }
      if (grupo.childElementCount) {
        contenedor.appendChild(grupo);
        hayOpciones = true;
      }
    }

    if (item.tipo === 'combo') {
      const nombres = nombresIncluye(item);
      if (nombres.length) {
        const caja = el('div', 'dp-incluye');
        caja.appendChild(el('p', 'dp-incluye-titulo', 'Incluye'));
        const lista = el('ul', 'dp-incluye-lista');
        for (const nombre of nombres) lista.appendChild(el('li', '', nombre));
        caja.appendChild(lista);
        contenedor.appendChild(caja);
        hayOpciones = true;
      }
    }

    contenedor.hidden = !hayOpciones;
  }

  function fieldset(leyenda) {
    const grupo = document.createElement('fieldset');
    grupo.className = 'grupo-opciones';
    grupo.appendChild(el('legend', '', leyenda));
    return grupo;
  }

  function crearOpcionRadio(id, nombre, valor, texto, precio, marcado) {
    const opcion = el('label', 'opcion');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.id = id;
    radio.name = nombre;
    radio.value = valor;
    radio.checked = marcado;
    radio.addEventListener('change', () => {
      if (!estado.producto) return;
      // Se deriva del value del radio elegido: ambos radios tienen checked=true al
      // seleccionarse, así que leer radio.checked rompía el precio al volver a "Sin borde".
      estado.producto.borde = radio.value === 'con-borde';
      actualizarTotalProducto();
    });
    opcion.appendChild(radio);
    opcion.appendChild(el('span', '', texto));
    if (precio) opcion.appendChild(el('span', 'opcion-precio', precio));
    return opcion;
  }

  function precioUnitarioProducto() {
    const producto = estado.producto;
    if (!producto) return 0;
    const item = producto.item;
    let precio = Number(item.precio) || 0;
    if (producto.borde && Number.isFinite(Number(item.precio_con_borde))) {
      precio = Number(item.precio_con_borde);
    }
    for (const idExtra of producto.extras) {
      const extra = buscarExtra(idExtra);
      if (extra) precio += Number(extra.precio) || 0;
    }
    return precio;
  }

  function actualizarTotalProducto() {
    const producto = estado.producto;
    if (!producto) return;
    const unitario = precioUnitarioProducto();
    const total = unitario * producto.cantidad;
    if ($('dp-precio')) $('dp-precio').textContent = gs(unitario);
    if ($('dp-cantidad')) $('dp-cantidad').textContent = String(producto.cantidad);
    const agregar = $('dp-agregar');
    if (agregar) agregar.textContent = `Agregar al carrito · ${gs(total)}`;
    const menos = $('dp-menos');
    if (menos) menos.disabled = producto.cantidad <= 1;
  }

  function cambiarCantidadProducto(delta) {
    const producto = estado.producto;
    if (!producto) return;
    producto.cantidad = Math.min(MAX_CANTIDAD, Math.max(1, producto.cantidad + delta));
    actualizarTotalProducto();
  }

  // El "+" de la tarjeta agrega directo con la configuración base (sin abrir la ficha).
  // La ficha queda para personalizar (borde, ingredientes, extras, cantidad).
  function agregarDirecto(item) {
    if (!item || item.agotado) return;
    agregarLinea({ id: item.id, cantidad: 1, borde: false, extras: [], sin: [] });
    mostrarToast(`${item.nombre} agregado al carrito.`);
  }

  function agregarProductoAlCarrito() {
    const producto = estado.producto;
    if (!producto) return;
    const ingredientes = Array.isArray(producto.item.ingredientes) ? producto.item.ingredientes : [];
    agregarLinea({
      id: producto.item.id,
      cantidad: producto.cantidad,
      borde: Boolean(producto.borde),
      extras: Array.from(producto.extras).sort(),
      sin: ingredientes.filter((nombre) => producto.sin.has(nombre))
    });
    cerrarDialogo($('dialogo-producto'));
    mostrarToast(`${producto.item.nombre} agregado al carrito.`);
  }

  // ---------- Carrito ----------
  function cargarCarrito() {
    estado.lineas = [];
    try {
      const crudo = localStorage.getItem(CLAVE_CARRITO);
      if (!crudo) return;
      const guardado = JSON.parse(crudo);
      if (!Array.isArray(guardado)) return;
      for (const linea of guardado) {
        if (!linea || typeof linea.id !== 'string') continue;
        const item = buscarProducto(linea.id);
        if (!item) continue;
        const cantidad = Math.trunc(Number(linea.cantidad));
        if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
        const extras = Array.isArray(linea.extras)
          ? linea.extras.filter((idExtra) => typeof idExtra === 'string' && buscarExtra(idExtra))
          : [];
        const ingredientes = Array.isArray(item.ingredientes) ? item.ingredientes : [];
        const sin = Array.isArray(linea.sin)
          ? ingredientes.filter((nombre) => linea.sin.includes(nombre))
          : [];
        estado.lineas.push({
          id: linea.id,
          cantidad: Math.min(MAX_CANTIDAD, cantidad),
          borde: Boolean(linea.borde),
          extras,
          sin
        });
      }
    } catch (error) {
      estado.lineas = [];
    }
  }

  function guardarCarrito() {
    try {
      localStorage.setItem(CLAVE_CARRITO, JSON.stringify(estado.lineas));
    } catch (error) {
      // Modo privado o almacenamiento bloqueado: seguimos en memoria.
    }
  }

  // Tras enviar el pedido por WhatsApp no debe quedar nada en el carrito:
  // evita que al día siguiente se arrastre un pedido viejo sin darse cuenta.
  function vaciarCarrito() {
    estado.lineas = [];
    try {
      localStorage.removeItem(CLAVE_CARRITO);
    } catch (error) {
      // Modo privado o almacenamiento bloqueado: igual limpiamos la memoria.
    }
    actualizarCarritoUI();
  }

  function listasIguales(a, b) {
    const uno = Array.isArray(a) ? a : [];
    const dos = Array.isArray(b) ? b : [];
    if (uno.length !== dos.length) return false;
    const ordenadoUno = uno.slice().sort();
    const ordenadoDos = dos.slice().sort();
    return ordenadoUno.every((valor, indice) => valor === ordenadoDos[indice]);
  }

  function agregarLinea(nueva) {
    if (!nueva || !buscarProducto(nueva.id)) return;
    const cantidad = Math.min(MAX_CANTIDAD, Math.max(1, Math.trunc(Number(nueva.cantidad)) || 1));
    const existente = estado.lineas.find(
      (linea) =>
        linea.id === nueva.id &&
        Boolean(linea.borde) === Boolean(nueva.borde) &&
        listasIguales(linea.extras, nueva.extras) &&
        listasIguales(linea.sin, nueva.sin)
    );
    if (existente) {
      existente.cantidad = Math.min(MAX_CANTIDAD, existente.cantidad + cantidad);
    } else {
      estado.lineas.push({
        id: nueva.id,
        cantidad,
        borde: Boolean(nueva.borde),
        extras: Array.isArray(nueva.extras) ? nueva.extras.slice() : [],
        sin: Array.isArray(nueva.sin) ? nueva.sin.slice() : []
      });
    }
    guardarCarrito();
    actualizarCarritoUI();
  }

  function cambiarCantidadLinea(linea, cantidad) {
    const indice = estado.lineas.indexOf(linea);
    if (indice < 0) return;
    const nueva = Math.min(MAX_CANTIDAD, Math.trunc(cantidad));
    if (!Number.isFinite(nueva) || nueva <= 0) {
      estado.lineas.splice(indice, 1);
    } else {
      linea.cantidad = nueva;
    }
    guardarCarrito();
    actualizarCarritoUI();
  }

  function quitarLinea(linea) {
    const indice = estado.lineas.indexOf(linea);
    if (indice < 0) return;
    estado.lineas.splice(indice, 1);
    guardarCarrito();
    actualizarCarritoUI();
  }

  function precioLinea(linea) {
    const item = buscarProducto(linea.id);
    if (!item) return 0;
    let precio = Number(item.precio) || 0;
    if (linea.borde && Number.isFinite(Number(item.precio_con_borde))) {
      precio = Number(item.precio_con_borde);
    }
    const extras = Array.isArray(linea.extras) ? linea.extras : [];
    for (const idExtra of extras) {
      const extra = buscarExtra(idExtra);
      if (extra) precio += Number(extra.precio) || 0;
    }
    return precio;
  }

  // Variante legible para el carrito y el mensaje de WhatsApp.
  function varianteLinea(linea) {
    const partes = [];
    if (linea.borde) partes.push('Con borde de queso');
    const sin = Array.isArray(linea.sin) ? linea.sin : [];
    if (sin.length) partes.push(`Sin: ${sin.join(', ')}`);
    const extras = Array.isArray(linea.extras) ? linea.extras : [];
    const nombres = extras
      .map((idExtra) => buscarExtra(idExtra))
      .filter(Boolean)
      .map((extra) => extra.nombre);
    if (nombres.length) partes.push(`Con extras: ${nombres.join(', ')}`);
    return partes.join(' · ');
  }

  function totalCarrito() {
    return estado.lineas.reduce((total, linea) => total + precioLinea(linea) * linea.cantidad, 0);
  }

  function unidadesCarrito() {
    return estado.lineas.reduce((total, linea) => total + linea.cantidad, 0);
  }

  function actualizarCarritoUI() {
    renderCarrito();
    renderSugerencias();
    actualizarBadge();
  }

  function actualizarBadge() {
    const unidades = unidadesCarrito();
    const contador = $('contador-carrito');
    const abrir = $('abrir-carrito');
    if (contador) contador.textContent = String(unidades);
    if (abrir) {
      abrir.setAttribute(
        'aria-label',
        unidades === 1 ? 'Abrir carrito (1 producto)' : `Abrir carrito (${unidades} productos)`
      );
    }
    const whatsapp = $('btn-whatsapp');
    if (whatsapp) whatsapp.disabled = estado.lineas.length === 0;
  }

  function renderCarrito() {
    const lista = $('carrito-lineas');
    const vacio = $('carrito-vacio');
    if (!lista || !vacio) return;
    lista.replaceChildren();
    const hay = estado.lineas.length > 0;
    vacio.hidden = hay;
    lista.hidden = !hay;
    for (const linea of estado.lineas) {
      const item = buscarProducto(linea.id);
      if (!item) continue;
      lista.appendChild(crearLineaCarrito(linea, item));
    }
    const total = $('carrito-total');
    if (total) total.textContent = gs(totalCarrito());
  }

  function crearLineaCarrito(linea, item) {
    const fila = el('li', 'linea');
    fila.appendChild(imagen('linea-img', item.imagen, '', true));

    const info = el('div', 'linea-info');
    info.appendChild(el('p', 'linea-nombre', item.nombre));
    const variante = varianteLinea(linea);
    if (variante) info.appendChild(el('p', 'linea-variante', variante));

    const acciones = el('div', 'linea-acciones');
    const grupo = el('div', 'control-grupo');
    const menos = boton('control-cantidad', '−', `Quitar uno de ${item.nombre}`);
    menos.disabled = linea.cantidad <= 1;
    menos.addEventListener('click', () => cambiarCantidadLinea(linea, linea.cantidad - 1));
    const valor = el('span', 'linea-cantidad', String(linea.cantidad));
    valor.setAttribute('aria-live', 'polite');
    const mas = boton('control-cantidad', '+', `Sumar uno de ${item.nombre}`);
    mas.addEventListener('click', () => cambiarCantidadLinea(linea, linea.cantidad + 1));
    grupo.append(menos, valor, mas);
    acciones.appendChild(grupo);

    const quitar = boton('boton-quitar', 'Quitar', `Quitar ${item.nombre} del carrito`);
    quitar.addEventListener('click', () => quitarLinea(linea));
    acciones.appendChild(quitar);
    info.appendChild(acciones);

    fila.append(info, el('p', 'linea-precio', gs(precioLinea(linea) * linea.cantidad)));
    return fila;
  }

  function renderSugerencias() {
    const contenedor = $('sugerencias');
    if (!contenedor) return;
    contenedor.replaceChildren();
    const categoriasEnCarrito = new Set(
      estado.lineas.map((linea) => categoriaDeProducto(linea.id)).filter(Boolean)
    );
    const sugerencias =
      estado.menu && Array.isArray(estado.menu.sugerencias) ? estado.menu.sugerencias : [];
    let mostradas = 0;
    for (const sugerencia of sugerencias) {
      if (!sugerencia || !sugerencia.cuando || !sugerencia.si_falta) continue;
      if (!categoriasEnCarrito.has(sugerencia.cuando.categoria)) continue;
      if (categoriasEnCarrito.has(sugerencia.si_falta.categoria)) continue;
      const oferta = buscarProducto(sugerencia.oferta);
      if (!oferta || oferta.agotado) continue;
      const caja = el('div', 'sugerencia');
      caja.appendChild(imagen('sugerencia-img', oferta.imagen, oferta.nombre, true));
      const texto = el('div', 'sugerencia-texto');
      texto.appendChild(el('p', 'sugerencia-mensaje', sugerencia.mensaje || '¿Agregamos algo más?'));
      const agregar = boton(
        'boton-sugerencia',
        `+ Agregar ${oferta.nombre} · ${gs(oferta.precio)}`,
        `Agregar ${oferta.nombre} al carrito`
      );
      agregar.addEventListener('click', () => {
        agregarLinea({ id: oferta.id, cantidad: 1, borde: false, extras: [], sin: [] });
        mostrarToast(`${oferta.nombre} agregado al carrito.`);
      });
      texto.appendChild(agregar);
      caja.appendChild(texto);
      contenedor.appendChild(caja);
      mostradas++;
    }
    contenedor.hidden = mostradas === 0;
  }

  // ---------- Pedido por WhatsApp (mensaje estructurado) ----------
  function numeroWhatsApp() {
    const negocio = (estado.menu && estado.menu.negocio) || {};
    const config = estado.config || {};
    const crudo = negocio.whatsapp || config.whatsapp || '';
    return String(crudo).replace(/\D/g, '');
  }

  function modalidadElegida() {
    const marcado = document.querySelector('input[name="modalidad"]:checked');
    return marcado ? marcado.value : 'Delivery';
  }

  function mensajePedido() {
    // Solo el pedido, la cantidad y el total: sin dirección, calle ni referencias.
    const lineas = ['*NUEVO PEDIDO - KR BURGER*', '_Pedido desde el menú digital_', ''];
    let numero = 0;
    for (const linea of estado.lineas) {
      const item = buscarProducto(linea.id);
      if (!item) continue;
      numero++;
      const cantidad = linea.cantidad > 1 ? ` ×${linea.cantidad}` : '';
      const filas = [`*${numero}. ${item.nombre}${cantidad}*`];
      if (linea.borde) filas.push('   Con borde de queso');
      const sin = Array.isArray(linea.sin) ? linea.sin : [];
      if (sin.length) filas.push(`   Sin: ${sin.join(', ')}`);
      const extras = Array.isArray(linea.extras) ? linea.extras : [];
      const nombres = extras
        .map((idExtra) => buscarExtra(idExtra))
        .filter(Boolean)
        .map((extra) => extra.nombre);
      if (nombres.length) filas.push(`   Extras: ${nombres.join(', ')}`);
      if (item.tipo === 'combo') {
        const incluye = resumenIncluye(item);
        if (incluye) filas.push(`   Incluye: ${incluye}`);
      }
      lineas.push(filas.join('\n'));
    }
    const modalidad = modalidadElegida();
    lineas.push('', `*Total:* ${gs(totalCarrito())}`, `*Modalidad:* ${modalidad}`);
    return lineas.join('\n');
  }

  function pedirPorWhatsApp() {
    if (!estado.lineas.length) return;
    const numero = numeroWhatsApp();
    if (!numero) {
      mostrarToast('No pudimos obtener el número de WhatsApp. Probá de nuevo más tarde.');
      return;
    }
    const mensaje = mensajePedido();
    const detalle = {
      mensaje,
      total: totalCarrito(),
      modalidad: modalidadElegida(),
      unidades: unidadesCarrito(),
      lineas: estado.lineas.map((linea) => ({
        id: linea.id,
        cantidad: linea.cantidad,
        borde: linea.borde,
        extras: linea.extras.slice(),
        sin: linea.sin.slice(),
        subtotal: precioLinea(linea) * linea.cantidad
      }))
    };
    document.dispatchEvent(new CustomEvent('pedido-confirmado', { detail: detalle }));
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank', 'noopener');
    cerrarDialogo($('dialogo-carrito'));
    vaciarCarrito();
    mostrarToast('Pedido enviado por WhatsApp. El carrito quedó vacío para tu próxima compra.');
  }

  // ---------- Instalación como app (PWA) ----------
  let eventoInstalar = null;

  function esModoApp() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function esIOS() {
    return (
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  function mostrarInstalar(modo) {
    const aviso = $('instalar-app');
    if (!aviso) return;
    let oculto = false;
    try {
      oculto = localStorage.getItem(CLAVE_INSTALAR) === '1';
    } catch (error) {
      // Modo privado: se muestra igual.
    }
    if (esModoApp() || oculto) return;
    const nota = $('instalar-nota');
    const boton = $('instalar-boton');
    if (modo === 'ios') {
      if (nota) nota.textContent = 'En iPhone: tocá Compartir y elegí “Agregar a pantalla de inicio”.';
      if (boton) boton.textContent = 'Cómo instalar';
    } else {
      if (nota) nota.textContent = 'Agregala a tu pantalla de inicio para pedir más rápido.';
      if (boton) boton.textContent = 'Instalar';
    }
    aviso.hidden = false;
  }

  function ocultarInstalar(recordar) {
    const aviso = $('instalar-app');
    if (aviso) aviso.hidden = true;
    if (!recordar) return;
    try {
      localStorage.setItem(CLAVE_INSTALAR, '1');
    } catch (error) {
      // Modo privado: se oculta solo en esta visita.
    }
  }

  function conectarInstalacion() {
    window.addEventListener('beforeinstallprompt', (evento) => {
      evento.preventDefault();
      eventoInstalar = evento;
      mostrarInstalar('prompt');
    });
    window.addEventListener('appinstalled', () => {
      eventoInstalar = null;
      ocultarInstalar(true);
      mostrarToast('¡Listo! KR BURGER quedó instalada.');
    });
    const botonInstalar = $('instalar-boton');
    if (botonInstalar) {
      botonInstalar.addEventListener('click', async () => {
        if (eventoInstalar && typeof eventoInstalar.prompt === 'function') {
          eventoInstalar.prompt();
          try {
            await eventoInstalar.userChoice;
          } catch (error) {
            // Si el navegador no devuelve la elección, seguimos.
          }
          eventoInstalar = null;
          ocultarInstalar(true);
          return;
        }
        if (esIOS()) {
          mostrarInstalar('ios');
          mostrarToast('En iPhone: Compartir → Agregar a pantalla de inicio.');
          return;
        }
        mostrarToast('Abrí el menú del navegador y elegí “Instalar app” o “Agregar a pantalla de inicio”.');
      });
    }
    const cerrar = $('instalar-cerrar');
    if (cerrar) cerrar.addEventListener('click', () => ocultarInstalar(true));
    const enPie = $('instalar-pie');
    if (enPie) {
      enPie.addEventListener('click', () => {
        const aviso = $('instalar-app');
        if (aviso && !aviso.hidden) {
          if (botonInstalar) botonInstalar.click();
          return;
        }
        if (eventoInstalar) {
          mostrarInstalar('prompt');
          if (botonInstalar) botonInstalar.click();
          return;
        }
        if (esIOS()) {
          mostrarInstalar('ios');
          return;
        }
        mostrarToast('Abrí el menú del navegador y elegí “Instalar app” o “Agregar a pantalla de inicio”.');
      });
    }
    if (esIOS() && !esModoApp()) mostrarInstalar('ios');
  }

  // ---------- Diálogos ----------
  function abrirDialogo(dialogo) {
    if (!dialogo) return;
    if (typeof dialogo.showModal === 'function') {
      if (!dialogo.open) dialogo.showModal();
    } else {
      dialogo.setAttribute('open', '');
    }
  }

  function cerrarDialogo(dialogo) {
    if (!dialogo) return;
    if (typeof dialogo.close === 'function') {
      if (dialogo.open) dialogo.close();
    } else {
      dialogo.removeAttribute('open');
    }
  }

  function abrirCarrito() {
    actualizarCarritoUI();
    abrirDialogo($('dialogo-carrito'));
  }

  // ---------- Splash ----------
  function entrarAlMenu() {
    const splash = $('splash');
    if (!splash || splash.hidden) return;
    document.body.classList.remove('sin-scroll');
    const catalogo = $('catalogo');
    const terminar = () => {
      splash.classList.remove('saliendo');
      splash.setAttribute('aria-hidden', 'true');
      splash.hidden = true;
      // preventScroll: el foco no debe desplazar la portada bajo la cabecera fija.
      if (catalogo) catalogo.focus({ preventScroll: true });
    };
    if (prefiereMenosMovimiento()) {
      terminar();
      return;
    }
    splash.classList.add('saliendo');
    const alTerminar = (evento) => {
      if (evento.type === 'transitionend' && evento.propertyName !== 'transform') return;
      splash.removeEventListener('transitionend', alTerminar);
      terminar();
    };
    splash.addEventListener('transitionend', alTerminar);
    setTimeout(() => {
      if (!splash.hidden) {
        splash.removeEventListener('transitionend', alTerminar);
        terminar();
      }
    }, 950);
  }

  // ---------- Eventos base ----------
  function conectarEventosBase() {
    for (const logo of document.querySelectorAll('.splash-logo, .marca-logo')) repararLogo(logo);
    conectarHistorial();
    conectarInstalacion();

    const entrar = $('btn-entrar');
    if (entrar) entrar.addEventListener('click', entrarAlMenu);

    const volver = $('volver-categorias');
    if (volver) volver.addEventListener('click', volverCategorias);

    const abrir = $('abrir-carrito');
    if (abrir) abrir.addEventListener('click', abrirCarrito);

    const cerrarCarrito = $('dc-cerrar');
    if (cerrarCarrito) cerrarCarrito.addEventListener('click', () => cerrarDialogo($('dialogo-carrito')));

    const seguir = $('dc-seguir');
    if (seguir) seguir.addEventListener('click', () => cerrarDialogo($('dialogo-carrito')));

    const cerrarProducto = $('dp-cerrar');
    if (cerrarProducto) cerrarProducto.addEventListener('click', () => cerrarDialogo($('dialogo-producto')));

    const restar = $('dp-menos');
    if (restar) restar.addEventListener('click', () => cambiarCantidadProducto(-1));

    const sumar = $('dp-mas');
    if (sumar) sumar.addEventListener('click', () => cambiarCantidadProducto(1));

    const agregar = $('dp-agregar');
    if (agregar) agregar.addEventListener('click', agregarProductoAlCarrito);

    const whatsapp = $('btn-whatsapp');
    if (whatsapp) whatsapp.addEventListener('click', pedirPorWhatsApp);

    const reintentar = $('reintentar');
    if (reintentar) reintentar.addEventListener('click', () => window.location.reload());

    // Al cerrar la ficha se restaura el scroll sin re-renderizar la grilla.
    const dialogoProducto = $('dialogo-producto');
    if (dialogoProducto) {
      dialogoProducto.addEventListener('close', () => {
        if (estado.scrollModal === null) return;
        const y = estado.scrollModal;
        estado.scrollModal = null;
        requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }));
      });
      // Cierre al tocar el fondo; Escape lo maneja <dialog> de forma nativa.
      dialogoProducto.addEventListener('click', (evento) => {
        if (evento.target === dialogoProducto) cerrarDialogo(dialogoProducto);
      });
    }
    const dialogoCarrito = $('dialogo-carrito');
    if (dialogoCarrito) {
      dialogoCarrito.addEventListener('click', (evento) => {
        if (evento.target === dialogoCarrito) cerrarDialogo(dialogoCarrito);
      });
    }
  }

  // ---------- Service worker ----------
  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const registrar = () => {
      try {
        navigator.serviceWorker.register('sw.js').catch(() => {
          // Sin service worker la app sigue funcionando en línea.
        });
      } catch (error) {
        // Idem: registro no disponible en este contexto.
      }
    };
    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar, { once: true });
  }

  // ---------- Arranque ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  } else {
    iniciar();
  }
})();
