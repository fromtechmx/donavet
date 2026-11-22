/* Dona Vet&Care · Recepción — versión mínima sobre Supabase.
   Pantallas: inicio de sesión, búsqueda de clientes, ficha del cliente con mascotas, historial y notas de AVImark,
   abrir consulta y capturar ingreso, examen y diagnóstico. El cobro (cargos, abonos) llega en la siguiente etapa.
   Todo cambio pasa por funciones de la base (rpc); este archivo no escribe directo en las tablas. */
(function () {
  'use strict';
  var cfg = window.DONAVET_CONFIG;
  var sb = window.supabase.createClient(cfg.url, cfg.key);
  var app = document.getElementById('app');
  var sesion = { perfil: null };
  var MOTIVOS = ['Consulta', 'Aplicación de vacuna', 'Aplicación de medicamento', 'Estudio o cirugía', 'Estética'];
  var peso = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

  // ---------- utilidades ----------
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function limpiar(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function msg(tipo, texto) { return h('div', { class: 'mensaje ' + tipo, role: tipo === 'error' ? 'alert' : 'status' }, texto); }
  function fechaTxt(f) { if (!f) return ''; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(f); }
  function fechaHora(f) { if (!f) return ''; var d = new Date(f); return isNaN(d) ? String(f) : d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }); }
  function claseSexo(s) { return s === 'Hembra' ? 'hembra' : s === 'Macho' ? 'macho' : ''; }
  function simboloSexo(s) { return s === 'Hembra' ? '♀ Hembra' : s === 'Macho' ? '♂ Macho' : ''; }
  function errTxt(e) { return (e && (e.message || e.error)) ? String(e.message || e.error) : 'Ocurrió un error. Intenta de nuevo.'; }
  function ir(ruta) { if (location.hash === '#' + ruta) enrutar(); else location.hash = ruta; }

  // ---------- estructura general ----------
  function marco(contenido) {
    limpiar(app);
    app.appendChild(h('header', { class: 'barra' },
      h('a', { class: 'marca', href: '#/' }, 'Dona Vet&Care'),
      h('div', { class: 'quien' }, sesion.perfil ? sesion.perfil.nombre + ' · ' + sesion.perfil.rol : '',
        h('button', { class: 'enlace', onclick: salir }, 'Salir'))));
    var main = h('main', {});
    add(main, contenido);
    app.appendChild(main);
    return main;
  }
  function salir() { sb.auth.signOut().then(function () { sesion.perfil = null; mostrarLogin(); }); }

  // ---------- inicio de sesión ----------
  function mostrarLogin(aviso) {
    limpiar(app);
    var correo = h('input', { type: 'email', autocomplete: 'username', required: true });
    var clave = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    var zona = h('div', {});
    var boton = h('button', { class: 'principal', type: 'submit' }, 'Entrar');
    var forma = h('form', { class: 'tarjeta login' },
      h('h1', {}, 'Dona Vet&Care'), h('div', { class: 'sub' }, 'Recepción'),
      h('label', {}, 'Correo'), correo, h('label', {}, 'Contraseña'), clave, zona,
      h('div', { style: 'margin-top:14px' }, boton));
    forma.addEventListener('submit', function (ev) {
      ev.preventDefault(); limpiar(zona); boton.disabled = true;
      sb.auth.signInWithPassword({ email: correo.value.trim(), password: clave.value }).then(function (r) {
        if (r.error) { boton.disabled = false; zona.appendChild(msg('error', r.error.status === 400 || /invalid login/i.test(r.error.message || '') ? 'Correo o contraseña incorrectos.' : 'No se pudo conectar. Revisa el internet e intenta de nuevo.')); return; }
        iniciar();
      });
    });
    if (aviso) zona.appendChild(msg('error', aviso));
    app.appendChild(forma);
  }

  function iniciar() {
    sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) return mostrarLogin();
      sb.from('perfiles').select('nombre,rol,activo').eq('user_id', s.user.id).maybeSingle().then(function (p) {
        if (p.error || !p.data || !p.data.activo) {
          sb.auth.signOut().then(function () { mostrarLogin('Tu usuario todavía no tiene perfil activo en Dona Vet. Pide que te den de alta.'); });
          return;
        }
        sesion.perfil = p.data;
        if (!location.hash) location.hash = '/';
        enrutar();
      });
    });
  }

  // ---------- rutas ----------
  function enrutar() {
    if (!sesion.perfil) return;
    var r = (location.hash || '#/').slice(1).split('/').filter(Boolean).map(decodeURIComponent);
    if (r[0] === 'cliente' && r[1]) return vistaCliente(r[1], r[2]);
    if (r[0] === 'consulta' && r[1]) return vistaConsulta(r[1]);
    vistaBuscar();
  }
  window.addEventListener('hashchange', enrutar);

  // ---------- búsqueda ----------
  var ultimaBusqueda = '';
  function vistaBuscar() {
    var caja = h('input', { type: 'search', placeholder: 'Nombre del dueño, de la mascota, teléfono o ID de cliente', autofocus: true, value: ultimaBusqueda });
    var res = h('div', {});
    var main = marco([h('h1', {}, 'Clientes'), h('div', { class: 'tarjeta' }, caja), res]);
    var espera = null, n = 0;
    function buscar() {
      var q = caja.value.trim(); ultimaBusqueda = caja.value;
      limpiar(res);
      if (q.length < 2) { res.appendChild(h('p', { class: 'sub' }, 'Escribe al menos 2 letras o 4 números del teléfono.')); return; }
      var mi = ++n;
      res.appendChild(h('p', { class: 'sub' }, 'Buscando…'));
      sb.rpc('buscar_clientes', { p_q: q, p_limite: 30 }).then(function (r) {
        if (mi !== n) return;
        limpiar(res);
        if (r.error) return res.appendChild(msg('error', errTxt(r.error)));
        if (!r.data.length) return res.appendChild(h('p', { class: 'sub' }, 'Sin resultados.'));
        res.appendChild(h('div', { class: 'tarjeta' }, h('ul', { class: 'lista' }, r.data.map(function (c) {
          return h('li', {}, h('a', { href: '#/cliente/' + c.cliente_id },
            h('strong', {}, c.nombre), ' ', h('span', { class: 'sub' }, '#' + c.cliente_id + (c.telefono ? ' · ' + c.telefono : '')),
            h('div', { class: 'sub' }, (c.mascotas || []).join(', '))));
        }))));
      });
    }
    caja.addEventListener('input', function () { clearTimeout(espera); espera = setTimeout(buscar, 300); });
    if (ultimaBusqueda) buscar();
    caja.focus();
    return main;
  }

  // ---------- ficha del cliente ----------
  function vistaCliente(idCliente, idMascota) {
    var cont = h('div', {}, h('p', { class: 'cargando' }, 'Cargando…'));
    marco(cont);
    Promise.all([
      sb.from('clientes').select('*').eq('id', idCliente).maybeSingle(),
      sb.from('mascotas').select('*').eq('cliente_id', idCliente).order('nombre')
    ]).then(function (r) {
      limpiar(cont);
      if (r[0].error || r[1].error) return cont.appendChild(msg('error', errTxt(r[0].error || r[1].error)));
      var c = r[0].data;
      if (!c) return cont.appendChild(msg('error', 'No existe el cliente ' + idCliente + '.'));
      var mascotas = (r[1].data || []).slice().sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base', numeric: true }); });
      cont.appendChild(h('p', {}, h('a', { href: '#/' }, '← Clientes')));
      cont.appendChild(h('div', { class: 'tarjeta' },
        h('h1', {}, c.nombre),
        h('div', { class: 'sub' }, 'Cliente #' + c.id + (c.telefono ? ' · Tel. ' + c.telefono : ' · sin teléfono') + (c.ciudad ? ' · ' + c.ciudad : '') + (c.domicilio ? ' · ' + c.domicilio : '')),
        c.estado === 'Fusionado' ? msg('error', 'Esta cuenta está fusionada con la ' + c.fusionado_en + '.') : null));
      cont.appendChild(h('h2', {}, 'Mascotas (' + mascotas.length + ')'));
      cont.appendChild(h('div', { class: 'rejilla' }, mascotas.map(function (m) {
        return h('a', { class: 'mascota ' + claseSexo(m.sexo) + (m.id === idMascota ? ' activa' : ''), href: '#/cliente/' + encodeURIComponent(c.id) + '/' + encodeURIComponent(m.id) },
          h('strong', {}, m.nombre), ' ', h('span', { class: 'sub' }, m.id),
          h('div', {}, h('span', { class: 'sexo ' + claseSexo(m.sexo) }, simboloSexo(m.sexo)), (m.sexo && (m.especie || m.raza)) ? ' · ' : '', [m.especie, m.raza].filter(Boolean).join(' · ')),
          m.estado === 'Fallecida' ? h('div', { class: 'sub' }, 'Fallecida') : null);
      })));
      if (!mascotas.length) cont.appendChild(h('p', { class: 'sub' }, 'Este cliente no tiene mascotas registradas.'));
      var detalle = h('div', {});
      cont.appendChild(detalle);
      var m = mascotas.filter(function (x) { return x.id === idMascota; })[0];
      if (idMascota && !m) detalle.appendChild(msg('error', 'La mascota ' + idMascota + ' no es de este cliente.'));
      if (m) panelMascota(detalle, c, m);
    });
  }

  function panelMascota(cont, cliente, m) {
    var edad = m.nacimiento ? fechaTxt(m.nacimiento) : (m.nacimiento_texto || '');
    cont.appendChild(h('div', { class: 'tarjeta' },
      h('h2', {}, m.nombre + ' ' ),
      h('div', { class: 'sub' }, [m.especie, m.raza, m.color, edad ? 'Nac. ' + edad : '', m.peso_kg ? m.peso_kg + ' kg' : ''].filter(Boolean).join(' · ')),
      h('div', { class: 'fila', style: 'margin-top:10px' },
        h('button', { class: 'principal', onclick: function () { dialogoAbrir(cont, m); }, disabled: m.estado === 'Fallecida' }, 'Abrir consulta'))));
    var zonaAbrir = h('div', { id: 'zona-abrir' }); cont.appendChild(zonaAbrir);
    var consultas = h('div', {}), historial = h('div', {}), notas = h('div', {});
    cont.appendChild(consultas); cont.appendChild(historial); cont.appendChild(notas);

    sb.from('consultas').select('id,tipo,estado,abierta_el,abierta_por').eq('mascota_id', m.id).order('abierta_el', { ascending: false }).limit(20).then(function (r) {
      if (r.error) return consultas.appendChild(msg('error', errTxt(r.error)));
      if (!r.data.length) return;
      consultas.appendChild(h('h2', {}, 'Consultas en este sistema'));
      consultas.appendChild(h('div', { class: 'tarjeta' }, h('ul', { class: 'lista' }, r.data.map(function (x) {
        return h('li', {}, h('a', { href: '#/consulta/' + x.id }, h('strong', {}, x.id), ' · ', x.tipo, ' · ', x.estado, h('span', { class: 'sub' }, ' · ' + fechaHora(x.abierta_el) + ' · ' + x.abierta_por)));
      }))));
    });

    sb.from('historial_avimark').select('fecha,categoria,descripcion,cantidad,importe,doctor,tipo').eq('mascota_id', m.id).order('fecha', { ascending: false }).limit(500).then(function (r) {
      if (r.error) return historial.appendChild(msg('error', errTxt(r.error)));
      historial.appendChild(h('h2', {}, 'Historial de AVImark (' + r.data.length + (r.data.length === 500 ? '+' : '') + ')'));
      if (!r.data.length) return historial.appendChild(h('p', { class: 'sub' }, 'Sin movimientos desde 2020.'));
      var cats = {}; r.data.forEach(function (x) { if (x.categoria) cats[x.categoria] = true; });
      var filtro = h('select', {}, h('option', { value: '' }, 'Todo'), Object.keys(cats).sort().map(function (k) { return h('option', { value: k }, k); }));
      var cuerpo = h('tbody', {});
      function pintar() {
        limpiar(cuerpo);
        r.data.filter(function (x) { return !filtro.value || x.categoria === filtro.value; }).forEach(function (x) {
          cuerpo.appendChild(h('tr', {}, h('td', {}, fechaTxt(x.fecha)), h('td', {}, x.descripcion || ''), h('td', { class: 'num' }, x.cantidad === null ? '' : String(x.cantidad)),
            h('td', { class: 'num' }, x.importe === null ? '' : peso.format(Number(x.importe))), h('td', {}, x.doctor || '')));
        });
      }
      filtro.addEventListener('change', pintar); pintar();
      historial.appendChild(h('div', { class: 'tarjeta' }, h('div', { style: 'max-width:260px' }, filtro),
        h('div', { class: 'tabla-scroll' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Fecha'), h('th', {}, 'Concepto'), h('th', { class: 'num' }, 'Cant.'), h('th', { class: 'num' }, 'Importe'), h('th', {}, 'Doctor'))), cuerpo)),
        h('p', { class: 'sub' }, 'Es lo que se cobró y anotó en AVImark desde 2020, no un expediente clínico completo.')));
    });

    sb.from('notas_avimark').select('fecha,nota,tipo,concepto').eq('mascota_id', m.id).order('fecha', { ascending: false }).limit(200).then(function (r) {
      if (r.error) return notas.appendChild(msg('error', errTxt(r.error)));
      if (!r.data.length) return;
      notas.appendChild(h('h2', {}, 'Notas de AVImark (' + r.data.length + ')'));
      notas.appendChild(h('div', { class: 'tarjeta' }, r.data.map(function (x) {
        return h('div', { style: 'margin-bottom:10px' }, h('div', { class: 'sub' }, fechaTxt(x.fecha) + (x.concepto ? ' · ' + x.concepto : '')), h('div', { style: 'white-space:pre-wrap' }, x.nota));
      })));
    });
  }

  function dialogoAbrir(cont, m) {
    var zona = document.getElementById('zona-abrir'); limpiar(zona);
    var sel = h('select', {}, MOTIVOS.map(function (x) { return h('option', { value: x }, x); }));
    var salida = h('div', {});
    var ok = h('button', { class: 'principal', onclick: function () {
      ok.disabled = true; limpiar(salida);
      sb.rpc('abrir_consulta', { p_mascota: m.id, p_motivo: sel.value }).then(function (r) {
        var d = r.data;
        if (r.error || !d || !d.ok) { ok.disabled = false; return salida.appendChild(msg('error', r.error ? errTxt(r.error) : d && d.error || 'No se pudo abrir la consulta.')); }
        ir('/consulta/' + encodeURIComponent(d.id));
      });
    } }, 'Abrir');
    zona.appendChild(h('div', { class: 'tarjeta' }, h('label', {}, 'Motivo de la visita de ' + m.nombre), h('div', { class: 'fila' }, h('div', { class: 'crece' }, sel), ok,
      h('button', { onclick: function () { limpiar(zona); } }, 'Cancelar')), salida));
  }

  // ---------- consulta ----------
  var PASOS = [
    { clave: 'ingreso', titulo: '1 · Ingreso', campos: [
      { k: 'motivo_que', e: '¿Qué le pasa?', t: 'area' }, { k: 'motivo_desde', e: '¿Desde cuándo?', t: 'texto' },
      { k: 'motivo_tanto', e: '¿Qué tanto le afecta?', t: 'texto' }, { k: 'motivo_como', e: '¿Cómo se ha presentado?', t: 'texto' }] },
    { clave: 'examen', titulo: '2 · Examen físico', campos: [
      { k: 'ex_peso', e: 'Peso (kg)', t: 'numero' }, { k: 'ex_fc', e: 'Frecuencia cardiaca', t: 'numero' }, { k: 'ex_fr', e: 'Frecuencia respiratoria', t: 'numero' },
      { k: 'ex_temp', e: 'Temperatura (°C)', t: 'numero' }, { k: 'ex_observaciones', e: 'Observaciones', t: 'area' }] },
    { clave: 'dx', titulo: '3 · Diagnóstico y tratamiento', campos: [
      { k: 'dx_final', e: 'Diagnóstico', t: 'area' }, { k: 'dx_tratamiento', e: 'Tratamiento', t: 'area' }] }
  ];

  function vistaConsulta(id) {
    var cont = h('div', {}, h('p', { class: 'cargando' }, 'Cargando…'));
    marco(cont);
    Promise.all([
      sb.from('consultas').select('*').eq('id', id).maybeSingle(),
      sb.from('consulta_pasos').select('paso,v,datos,por,el').eq('consulta_id', id),
      sb.from('consulta_cargos').select('n,posicion,descripcion,cantidad,valor_unitario,precio_final_unitario').eq('consulta_id', id).order('posicion')
    ]).then(function (r) {
      limpiar(cont);
      if (r[0].error) return cont.appendChild(msg('error', errTxt(r[0].error)));
      var c = r[0].data;
      if (!c) return cont.appendChild(msg('error', 'No existe la consulta ' + id + '.'));
      Promise.all([sb.from('mascotas').select('nombre,sexo,especie').eq('id', c.mascota_id).maybeSingle(), sb.from('clientes').select('nombre,telefono').eq('id', c.cliente_id).maybeSingle()]).then(function (q) {
        var m = q[0].data || {}, cl = q[1].data || {};
        var pasos = {}; (r[1].data || []).forEach(function (p) { pasos[p.paso] = p; });
        cont.appendChild(h('p', {}, h('a', { href: '#/cliente/' + encodeURIComponent(c.cliente_id) + '/' + encodeURIComponent(c.mascota_id) }, '← ' + (m.nombre || c.mascota_id) + ' / ' + (cl.nombre || c.cliente_id))));
        cont.appendChild(h('div', { class: 'tarjeta mascota ' + claseSexo(m.sexo) },
          h('h1', {}, c.id + ' · ' + (m.nombre || c.mascota_id)),
          h('div', {}, h('span', { class: 'sexo ' + claseSexo(m.sexo) }, simboloSexo(m.sexo)), (m.sexo && m.especie) ? ' · ' : '', m.especie || ''),
          h('div', { class: 'sub' }, 'Dueño: ' + (cl.nombre || '') + (cl.telefono ? ' · ' + cl.telefono : '') + ' · ' + c.tipo + ' · ' + c.estado + ' · abierta por ' + c.abierta_por + ' el ' + fechaHora(c.abierta_el))));
        var editable = c.estado !== 'Anulada';
        if (!editable) cont.appendChild(msg('error', 'Esta consulta está anulada' + (c.anulada_motivo ? ': ' + c.anulada_motivo : '') + '. No se puede editar.'));
        PASOS.forEach(function (p) { cont.appendChild(formaPaso(c.id, p, pasos[p.clave], editable)); });
        var cargos = r[2].data || [];
        if (cargos.length) {
          cont.appendChild(h('h2', {}, 'Cargos guardados'));
          cont.appendChild(h('div', { class: 'tarjeta tabla-scroll' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Concepto'), h('th', { class: 'num' }, 'Cant.'), h('th', { class: 'num' }, 'Precio'))),
            h('tbody', {}, cargos.map(function (x) { return h('tr', {}, h('td', {}, x.descripcion), h('td', { class: 'num' }, String(x.cantidad)), h('td', { class: 'num' }, peso.format(Number(x.precio_final_unitario !== null ? x.precio_final_unitario : x.valor_unitario)))); })))));
        }
        cont.appendChild(h('p', { class: 'sub' }, 'Cobro, abonos y receta llegan en la siguiente etapa; aquí solo se muestran los cargos que ya existan.'));
      });
    });
  }

  function formaPaso(idConsulta, paso, guardado, editable) {
    var datos = (guardado && guardado.datos) || {}, version = guardado ? guardado.v : 0;
    var entradas = {};
    var salida = h('div', {});
    var campos = paso.campos.map(function (f) {
      var el = f.t === 'area' ? h('textarea', {}) : h('input', { type: f.t === 'numero' ? 'text' : 'text', inputmode: f.t === 'numero' ? 'decimal' : null });
      el.value = datos[f.k] === undefined || datos[f.k] === null ? '' : String(datos[f.k]);
      if (!editable) el.disabled = true;
      entradas[f.k] = el;
      return h('div', {}, h('label', {}, f.e), el);
    });
    var boton = h('button', { class: 'principal', disabled: !editable, onclick: function () {
      limpiar(salida);
      var envio = {};
      paso.campos.forEach(function (f) {
        var nuevo = entradas[f.k].value.trim(), antes = datos[f.k] === undefined || datos[f.k] === null ? '' : String(datos[f.k]);
        if (nuevo === antes) return;
        if (f.t === 'numero' && nuevo !== '') {
          var n = Number(nuevo.replace(',', '.'));
          if (!isFinite(n) || n < 0) { envio = null; salida.appendChild(msg('error', f.e + ': escribe un número válido.')); return; }
          envio && (envio[f.k] = n);
        } else if (envio) envio[f.k] = nuevo;
      });
      if (!envio) return;
      if (!Object.keys(envio).length) return salida.appendChild(msg('ok', 'No hay cambios que guardar.'));
      boton.disabled = true;
      sb.rpc('guardar_paso', { p_consulta: idConsulta, p_paso: paso.clave, p_datos: envio, p_version: version }).then(function (r) {
        boton.disabled = false;
        var d = r.data;
        if (r.error || !d) return salida.appendChild(msg('error', errTxt(r.error)));
        if (d.conflicto) { salida.appendChild(msg('error', d.error + (d.por ? ' (' + d.por + ')' : '') + ' Recarga la consulta para ver lo último.')); return; }
        if (!d.ok) return salida.appendChild(msg('error', d.error || 'No se pudo guardar.'));
        version = d.v; Object.keys(envio).forEach(function (k) { datos[k] = envio[k]; });
        salida.appendChild(msg('ok', 'Guardado (' + d.cambios + ' cambio' + (d.cambios === 1 ? '' : 's') + ').'));
      });
    } }, 'Guardar paso');
    return h('div', { class: 'tarjeta paso' }, h('h3', {}, paso.titulo),
      h('div', { class: 'meta' }, guardado ? 'Guardado por ' + guardado.por + ' · ' + fechaHora(guardado.el) + ' · v' + guardado.v : 'Sin capturar'),
      h('div', { class: 'dos' }, campos), h('div', { style: 'margin-top:12px' }, boton), salida);
  }

  // ---------- arranque ----------
  sb.auth.onAuthStateChange(function (evento) { if (evento === 'SIGNED_OUT') { sesion.perfil = null; } });
  iniciar();
})();
