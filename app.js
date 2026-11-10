'use strict';
/* KR BURGER & PIZZA — frontend público v2 (Directiva Parte 4), sin dependencias.
   Dos pantallas: categorías (combos + tiles) y catálogo por categoría.
   Paleta Breaking Bad desde config.json, render con createElement/textContent,
   carrito en localStorage, diálogos <dialog> nativos y pedido estructurado por WhatsApp. */
(() => {
  const CLAVE_CARRITO = 'kr-burger-carrito-v1';
  const MAX_CANTIDAD = 99;
  const ID_CATEGORIA_INICIAL = 'hamburguesas';
  const MAPA_COLORES = {
    color_fondo: '--fondo',
    color_acento: '--acento',
    color_texto: '--texto',
    color_panel: '--panel',
    color_verde: '--verde'
  };
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

  // Respaldo del logo: si assets/ui/logo-kr.svg no se puede parsear (SVG mal formado),
  // se usa el ícono PNG oficial. No se modifica el asset: solo se muestra el alternativo.
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
    renderCategorias();
    renderUbicacion();
    cargarCarrito();
    const inicial =
      estado.categorias.find((categoria) => categoria.id === ID_CATEGORIA_INICIAL) || estado.categorias[0];
    if (inicial) {
      renderPanelCategoria(inicial.id);
      marcarCategoriaActiva(inicial.id);
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
    const kicker = $('portada-kicker');
    const taglinePortada = $('portada-tagline');
    const horarioPortada = $('portada-horario');
    const splashTagline = document.querySelector('.splash-tagline');
    if (nombreCabecera) nombreCabecera.textContent = nombre;
    if (kicker) kicker.textContent = nombre;
    if (taglineCabecera && negocio.tagline) taglineCabecera.textContent = negocio.tagline;
    if (taglinePortada && negocio.tagline) taglinePortada.textContent = negocio.tagline;
    if (splashTagline && negocio.tagline) splashTagline.textContent = negocio.tagline;
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
    asignar('ubicacion-referencia', ubicacion.referencia);
    asignar('ubicacion-horario', negocio.horario);
    asignar('ubicacion-delivery', ubicacion.delivery);
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

  // ---------- Pantallas ----------
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
    renderPanelCategoria(categoria.id);
    marcarCategoriaActiva(categoria.id);
    mostrarPantalla('catalogo');
    window.scrollTo({ top: 0, behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth' });
    const volver = $('volver-categorias');
    if (volver) volver.focus({ preventScroll: true });
  }

  function volverCategorias() {
    mostrarPantalla('categorias');
    const nav = $('nav-categorias');
    if (nav) nav.scrollIntoView({ behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth', block: 'start' });
    const tile = estado.categoriaActiva ? $('tab-' + estado.categoriaActiva) : null;
    if (tile) tile.focus({ preventScroll: true });
  }

  // ---------- Datos del menú ----------
  function construirCategorias() {
    const menu = estado.menu || {};
    const categorias = [];
    for (const categoria of Array.isArray(menu.categorias) ? menu.categorias : []) {
      if (!categoria || typeof categoria.id !== 'string') continue;
      const items = Array.isArray(categoria.items) ? categoria.items : [];
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

  function nombreCategoriaDe(idProducto) {
    if (estado.combos.some((combo) => combo.id === idProducto)) return 'Combos';
    const id = categoriaDeProducto(idProducto);
    const categoria = estado.categorias.find((item) => item.id === id);
    return categoria ? categoria.nombre : 'Menú';
  }

  function resumenIncluye(combo) {
    const ids = Array.isArray(combo.incluye) ? combo.incluye : [];
    return ids
      .map((idProducto) => buscarProducto(idProducto))
      .filter(Boolean)
      .map((producto) => producto.nombre)
      .join(' + ');
  }

  // ---------- Combos destacados ----------
  function renderCombos() {
    const carrusel = $('carrusel-combos');
    if (!carrusel) return;
    carrusel.replaceChildren();
    for (const combo of estado.combos) carrusel.appendChild(crearComboCard(combo));
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
    const incluye = resumenIncluye(combo);
    if (incluye) cuerpo.appendChild(el('p', 'combo-incluye', `Incluye: ${incluye}`));
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
    abrir.setAttribute('aria-label', item.agotado ? `${item.nombre} (agotado)` : `Ver ${item.nombre}`);

    const figura = el('div', 'tarjeta-figura');
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

    const mas = boton('tarjeta-mas', '+', item.agotado ? `${item.nombre} (agotado)` : `Ver opciones de ${item.nombre}`);
    mas.disabled = Boolean(item.agotado);
    mas.addEventListener('click', () => abrirProducto(item));

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
      extras: new Set()
    };
    const dialogo = $('dialogo-producto');
    const foto = $('dp-imagen');
    if (foto) {
      const resuelta = rutaImagen(item.imagen);
      if (resuelta) foto.src = resuelta;
      foto.alt = item.nombre;
    }
    if ($('dp-etiqueta')) $('dp-etiqueta').textContent = nombreCategoriaDe(item.id);
    if ($('dp-titulo')) $('dp-titulo').textContent = item.nombre;
    if ($('dp-descripcion')) $('dp-descripcion').textContent = item.descripcion || '';
    const esAlcohol = Boolean(item.alcohol);
    const badge18 = $('dp-badge-18');
    if (badge18) badge18.hidden = !esAlcohol;
    const avisoAlcohol = $('dp-alcohol');
    if (avisoAlcohol) avisoAlcohol.hidden = !esAlcohol;
    construirOpcionesProducto(item);
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

    const extras = Array.isArray(item.extras) ? item.extras : [];
    if (extras.length) {
      const grupo = fieldset('Extras');
      for (const idExtra of extras) {
        const extra = buscarExtra(idExtra);
        if (!extra) continue;
        const opcion = el('label', 'opcion');
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
        opcion.appendChild(el('span', '', extra.nombre));
        opcion.appendChild(el('span', 'opcion-precio', '+' + gs(extra.precio)));
        grupo.appendChild(opcion);
      }
      if (grupo.childElementCount) {
        contenedor.appendChild(grupo);
        hayOpciones = true;
      }
    }

    if (item.tipo === 'combo' && Array.isArray(item.incluye) && item.incluye.length) {
      const resumen = resumenIncluye(item);
      if (resumen) {
        contenedor.appendChild(el('p', 'dp-incluye', `Incluye: ${resumen}`));
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

  function agregarProductoAlCarrito() {
    const producto = estado.producto;
    if (!producto) return;
    agregarLinea({
      id: producto.item.id,
      cantidad: producto.cantidad,
      borde: Boolean(producto.borde),
      extras: Array.from(producto.extras).sort()
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
        if (!linea || typeof linea.id !== 'string' || !buscarProducto(linea.id)) continue;
        const cantidad = Math.trunc(Number(linea.cantidad));
        if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
        const extras = Array.isArray(linea.extras)
          ? linea.extras.filter((idExtra) => typeof idExtra === 'string' && buscarExtra(idExtra))
          : [];
        estado.lineas.push({
          id: linea.id,
          cantidad: Math.min(MAX_CANTIDAD, cantidad),
          borde: Boolean(linea.borde),
          extras
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

  function extrasIguales(a, b) {
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
        extrasIguales(linea.extras, nueva.extras)
    );
    if (existente) {
      existente.cantidad = Math.min(MAX_CANTIDAD, existente.cantidad + cantidad);
    } else {
      estado.lineas.push({
        id: nueva.id,
        cantidad,
        borde: Boolean(nueva.borde),
        extras: Array.isArray(nueva.extras) ? nueva.extras.slice() : []
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
        agregarLinea({ id: oferta.id, cantidad: 1, borde: false, extras: [] });
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

  function notaCliente() {
    const campo = $('nota-pedido');
    return campo && typeof campo.value === 'string' ? campo.value.trim() : '';
  }

  function mensajePedido() {
    const negocio = (estado.menu && estado.menu.negocio) || {};
    const ubicacion = negocio.ubicacion || {};
    const bloques = [];
    let numero = 0;
    for (const linea of estado.lineas) {
      const item = buscarProducto(linea.id);
      if (!item) continue;
      numero++;
      const variante = varianteLinea(linea);
      const detalle = variante ? ` (${variante})` : '';
      const filas = [`*${numero}. ${item.nombre}*`, `- ${linea.cantidad}x ${item.nombre}${detalle}`];
      if (item.tipo === 'combo') {
        const incluye = resumenIncluye(item);
        if (incluye) filas.push(`- Incluye: ${incluye}`);
      }
      bloques.push(filas.join('\n'));
    }
    const nota = notaCliente();
    if (nota) bloques.push(`- Nota: ${nota}`);
    const lineas = ['*NUEVO PEDIDO - KR BURGER*', '', bloques.join('\n\n'), '', `*Total:* ${gs(totalCarrito())}`, ''];
    const modalidad = modalidadElegida();
    lineas.push(`*Modalidad:* ${modalidad}`);
    const direccion = ubicacion.direccion || negocio.direccion;
    if (modalidad === 'Delivery') {
      if (direccion) lineas.push(`📍 ${direccion}`);
      if (ubicacion.referencia) lineas.push(`Referencia: ${ubicacion.referencia}`);
    }
    lineas.push('', '_Enviado desde el menú digital_');
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
      nota: notaCliente(),
      unidades: unidadesCarrito(),
      lineas: estado.lineas.map((linea) => ({
        id: linea.id,
        cantidad: linea.cantidad,
        borde: linea.borde,
        extras: linea.extras.slice(),
        subtotal: precioLinea(linea) * linea.cantidad
      }))
    };
    document.dispatchEvent(new CustomEvent('pedido-confirmado', { detail: detalle }));
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank', 'noopener');
    cerrarDialogo($('dialogo-carrito'));
    mostrarToast('Te abrimos WhatsApp con el pedido. El carrito queda guardado.');
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

    // Cierre al tocar el fondo del diálogo; Escape lo maneja <dialog> de forma nativa.
    for (const idDialogo of ['dialogo-producto', 'dialogo-carrito']) {
      const dialogo = $(idDialogo);
      if (!dialogo) continue;
      dialogo.addEventListener('click', (evento) => {
        if (evento.target === dialogo) cerrarDialogo(dialogo);
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
