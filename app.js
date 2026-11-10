'use strict';
/* KR BURGER & PIZZA — frontend público sin dependencias.
   Carga data/menu.json y data/config.json, renderiza el catálogo con createElement
   y textContent (sin HTML crudo con datos), maneja el carrito en localStorage y
   arma el pedido de WhatsApp. Los diálogos usan <dialog> nativo. */
(() => {
  const CLAVE_CARRITO = 'kr-burger-carrito-v1';
  const MAX_CANTIDAD = 99;
  const MAPA_COLORES = {
    color_fondo: '--fondo',
    color_acento: '--acento',
    color_texto: '--texto'
  };
  const formateador = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
  const estado = {
    menu: null,
    config: null,
    categorias: [],
    lineas: [],
    producto: null,
    categoriaActiva: null,
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

  function gs(valor) {
    return `${moneda()} ${formateador.format(Number(valor) || 0)}`;
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

  function moneda() {
    if (estado.config && typeof estado.config.moneda === 'string' && estado.config.moneda.trim()) {
      return estado.config.moneda.trim();
    }
    const negocio = estado.menu && estado.menu.negocio;
    return (negocio && negocio.moneda) || 'Gs';
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
    construirTabsYPaneles();
    cargarCarrito();
    const primera = estado.categorias[0];
    if (primera) activarCategoria(primera.id);
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
    const tagline = $('negocio-tagline');
    const pieHorario = $('pie-horario');
    const pieDireccion = $('pie-direccion');
    const splashTagline = document.querySelector('.splash-tagline');
    if (nombreCabecera) nombreCabecera.textContent = nombre;
    if (tagline && negocio.tagline) tagline.textContent = negocio.tagline;
    if (splashTagline && negocio.tagline) splashTagline.textContent = negocio.tagline;
    if (pieHorario && negocio.horario) pieHorario.textContent = negocio.horario;
    if (pieDireccion && negocio.direccion) pieDireccion.textContent = negocio.direccion;
    document.title = `${nombre} · Pedidos por WhatsApp`;
  }

  function mostrarError() {
    const carga = $('cargando-catalogo');
    const error = $('error-catalogo');
    const tabs = $('tabs');
    const secciones = $('secciones-catalogo');
    if (carga) carga.hidden = true;
    if (error) error.hidden = false;
    if (tabs) tabs.hidden = true;
    if (secciones) secciones.hidden = true;
  }

  function ocultarCarga() {
    const carga = $('cargando-catalogo');
    if (carga) carga.hidden = true;
  }

  // ---------- Catálogo ----------
  function construirCategorias() {
    const menu = estado.menu || {};
    const categorias = [];
    for (const categoria of Array.isArray(menu.categorias) ? menu.categorias : []) {
      if (!categoria || typeof categoria.id !== 'string') continue;
      categorias.push({
        id: categoria.id,
        nombre: categoria.nombre || categoria.id,
        items: Array.isArray(categoria.items) ? categoria.items : []
      });
    }
    if (Array.isArray(menu.combos) && menu.combos.length) {
      categorias.push({
        id: 'combos',
        nombre: 'Combos',
        items: menu.combos.map((combo) => Object.assign({}, combo, { tipo: 'combo', extras: [] }))
      });
    }
    estado.categorias = categorias;
  }

  function categoriaDeProducto(idProducto) {
    for (const categoria of estado.categorias) {
      if (categoria.items.some((item) => item && item.id === idProducto)) return categoria.id;
    }
    return null;
  }

  function buscarProducto(idProducto) {
    for (const categoria of estado.categorias) {
      const encontrado = categoria.items.find((item) => item && item.id === idProducto);
      if (encontrado) return encontrado;
    }
    return null;
  }

  function buscarExtra(idExtra) {
    const extras = (estado.menu && Array.isArray(estado.menu.extras)) ? estado.menu.extras : [];
    return extras.find((extra) => extra && extra.id === idExtra) || null;
  }

  function construirTabsYPaneles() {
    const tabs = $('tabs');
    const secciones = $('secciones-catalogo');
    if (!tabs || !secciones) return;
    tabs.replaceChildren();
    secciones.replaceChildren();
    for (const categoria of estado.categorias) {
      const tab = el('button', 'tab', categoria.nombre);
      tab.type = 'button';
      tab.id = `tab-${categoria.id}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', 'false');
      tab.setAttribute('aria-controls', `panel-${categoria.id}`);
      tab.tabIndex = -1;
      tab.addEventListener('click', () => activarCategoria(categoria.id));
      tab.addEventListener('keydown', (evento) => moverEntreTabs(evento, categoria.id));
      tabs.appendChild(tab);

      const panel = el('section', 'seccion-categoria');
      panel.id = `panel-${categoria.id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `tab-${categoria.id}`);
      panel.hidden = true;
      const titulo = el('h2', 'seccion-titulo', categoria.nombre);
      const grilla = el('div', 'grilla');
      panel.append(titulo, grilla);
      secciones.appendChild(panel);
    }
  }

  function moverEntreTabs(evento, idCategoria) {
    const teclas = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!teclas.includes(evento.key)) return;
    evento.preventDefault();
    const indice = estado.categorias.findIndex((categoria) => categoria.id === idCategoria);
    if (indice < 0) return;
    let destino = indice;
    if (evento.key === 'ArrowRight') destino = (indice + 1) % estado.categorias.length;
    if (evento.key === 'ArrowLeft') destino = (indice - 1 + estado.categorias.length) % estado.categorias.length;
    if (evento.key === 'Home') destino = 0;
    if (evento.key === 'End') destino = estado.categorias.length - 1;
    const objetivo = estado.categorias[destino];
    if (!objetivo) return;
    activarCategoria(objetivo.id);
    const tab = $('tab-' + objetivo.id);
    if (tab) tab.focus();
  }

  function activarCategoria(idCategoria) {
    const categoria = estado.categorias.find((item) => item.id === idCategoria) || estado.categorias[0];
    if (!categoria) return;
    estado.categoriaActiva = categoria.id;
    for (const otra of estado.categorias) {
      const tab = $('tab-' + otra.id);
      const panel = $('panel-' + otra.id);
      const activa = otra.id === categoria.id;
      if (tab) {
        tab.setAttribute('aria-selected', String(activa));
        tab.tabIndex = activa ? 0 : -1;
      }
      if (panel) panel.hidden = !activa;
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
  }

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
    if (item.agotado) figura.appendChild(el('span', 'tarjeta-sello', 'Agotado'));

    const cuerpo = el('div', 'tarjeta-cuerpo');
    cuerpo.appendChild(el('h3', 'tarjeta-nombre', item.nombre));
    if (item.descripcion) cuerpo.appendChild(el('p', 'tarjeta-descripcion', item.descripcion));

    const pie = el('div', 'tarjeta-pie');
    pie.appendChild(el('p', 'precio', gs(item.precio)));
    const badges = el('div', 'badges');
    if (item.destacado) badges.appendChild(el('span', 'badge badge-destacado', 'Destacado'));
    if (item.agotado) badges.appendChild(el('span', 'badge badge-agotado', 'Agotado'));
    if (badges.childElementCount) pie.appendChild(badges);
    cuerpo.appendChild(pie);

    abrir.append(figura, cuerpo);
    abrir.addEventListener('click', () => abrirProducto(item));
    articulo.appendChild(abrir);
    return articulo;
  }

  // ---------- (c) Diálogo de producto ----------
  function nombreCategoriaDe(idProducto) {
    const id = categoriaDeProducto(idProducto);
    const categoria = estado.categorias.find((item) => item.id === id);
    return categoria ? categoria.nombre : 'Menú';
  }

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
      const nombres = item.incluye
        .map((idProducto) => buscarProducto(idProducto))
        .filter(Boolean)
        .map((producto) => producto.nombre);
      if (nombres.length) {
        contenedor.appendChild(el('p', 'dp-incluye', `Incluye: ${nombres.join(' + ')}`));
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
      estado.producto.borde = radio.checked;
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

  function varianteLinea(linea) {
    const partes = [];
    if (linea.borde) partes.push('con borde');
    const extras = Array.isArray(linea.extras) ? linea.extras : [];
    for (const idExtra of extras) {
      const extra = buscarExtra(idExtra);
      if (extra) partes.push(extra.nombre);
    }
    return partes.join(', ');
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
    const sugerencias = Array.isArray(estado.menu && estado.menu.sugerencias) ? estado.menu.sugerencias : [];
    let mostradas = 0;
    for (const sugerencia of sugerencias) {
      if (!sugerencia || !sugerencia.cuando || !sugerencia.si_falta) continue;
      if (!categoriasEnCarrito.has(sugerencia.cuando.categoria)) continue;
      if (categoriasEnCarrito.has(sugerencia.si_falta.categoria)) continue;
      const oferta = buscarProducto(sugerencia.oferta);
      if (!oferta || oferta.agotado) continue;
      const caja = el('div', 'sugerencia');
      caja.appendChild(el('p', 'sugerencia-mensaje', sugerencia.mensaje || '¿Agregamos algo más?'));
      const agregar = boton(
        'boton-sugerencia',
        `Agregar ${oferta.nombre} · ${gs(oferta.precio)}`,
        `Agregar ${oferta.nombre} al carrito`
      );
      agregar.addEventListener('click', () => {
        agregarLinea({ id: oferta.id, cantidad: 1, borde: false, extras: [] });
        mostrarToast(`${oferta.nombre} agregado al carrito.`);
      });
      caja.appendChild(agregar);
      contenedor.appendChild(caja);
      mostradas++;
    }
    contenedor.hidden = mostradas === 0;
  }

  // ---------- Pedido por WhatsApp ----------
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
    const negocio = (estado.menu && estado.menu.negocio) || {};
    const lineas = [`¡Hola ${negocio.nombre || 'KR BURGER & PIZZA'}! Quiero hacer este pedido:`, ''];
    for (const linea of estado.lineas) {
      const item = buscarProducto(linea.id);
      if (!item) continue;
      const variante = varianteLinea(linea);
      const detalle = variante ? ` (${variante})` : '';
      lineas.push(`• ${linea.cantidad}x ${item.nombre}${detalle} — ${gs(precioLinea(linea) * linea.cantidad)}`);
    }
    lineas.push('', `Total: ${gs(totalCarrito())}`, `Modalidad: ${modalidadElegida()}`);
    if (negocio.mensaje_cierre) lineas.push('', negocio.mensaje_cierre);
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
      if (catalogo) catalogo.focus();
    };
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducido) {
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
