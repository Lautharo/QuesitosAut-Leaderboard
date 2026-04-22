const API_URL = "https://quesitos-backend.onrender.com"; 

let datosGlobales = [];
let modoActual = 'soloq';
let miGrafica = null;
let LOL_VER = "16.8.1"; 
let runesData = []; // Variable global para guardar el mapa de runas
let jugadorSeleccionado = null;

// --- COLORES ÚNICOS PARA CADA JUGADOR ---
const COLORES_JUGADORES = {
    "AU l Thxgzz": "#FF3366",       // Rosa Neón
    "Murs": "#33FFCC",              // Cian/Verde agua
    "AU l Ferry": "#FFCC33",        // Amarillo Dorado
    "Quesito Gruyere": "#B833FF",   // Violeta
    "AU l benji": "#3385FF",        // Azul
    "Quesito Azul": "#00E5FF",      // Celeste brillante
    "AU l Osiris": "#FF8000",       // Naranja
    "XCriadoenLobosX": "#33FF33"    // Verde Lima
};

// --- GENERADOR AUTOMÁTICO DE COLORES ---
function obtenerColor(nombre) {
    // Si el jugador ya tiene un color fijo asignado, usa ese
    if (COLORES_JUGADORES[nombre]) return COLORES_JUGADORES[nombre];
    
    // Si es un jugador nuevo (como Matti5), inventa un color único basado en su nombre
    let hash = 0;
    for (let i = 0; i < nombre.length; i++) {
        hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360; // Elige un tono de color de 0 a 360
    const colorDinamico = `hsl(${h}, 85%, 65%)`; // Colores tipo neón/pastel brillantes
    
    COLORES_JUGADORES[nombre] = colorDinamico; // Lo guarda para que siempre tenga el mismo color
    return colorDinamico;
}

// --- TRADUCTOR DE PUNTOS A RANGO PARA EL TOOLTIP ---
function decodificarPuntos(puntos) {
    if (puntos < 0) return "UNRANKED";
    
    const tiers = [
        { val: 9000, name: "CHALLENGER" }, { val: 8000, name: "GRANDMASTER" },
        { val: 7000, name: "MASTER" }, { val: 6000, name: "DIAMOND" },
        { val: 5000, name: "EMERALD" }, { val: 4000, name: "PLATINUM" },
        { val: 3000, name: "GOLD" }, { val: 2000, name: "SILVER" },
        { val: 1000, name: "BRONZE" }, { val: 0, name: "IRON" }
    ];
    
    // Encontramos el tier base
    let t = tiers.find(t => puntos >= t.val) || tiers[9];
    let resto = puntos - t.val;
    
    // Master, Grandmaster y Challenger no tienen divisiones
    if (t.val >= 7000) {
        return `${t.name} - ${resto} LP`;
    }
    
    const ranks = [
        { val: 400, name: "I" }, { val: 300, name: "II" },
        { val: 200, name: "III" }, { val: 100, name: "IV" }
    ];
    
    // Encontramos la división
    let r = ranks.find(r => resto >= r.val) || {val: 0, name: "IV"};
    let lp = resto - r.val;
    
    return `${t.name} ${r.name} - ${lp} LP`;
}

// --- FUNCIÓN DEL BOTÓN RESET ---
function resetearZoom() {
    if (miGrafica) {
        miGrafica.resetZoom();
    }
}

const ARAM_TITLES = [
    "ARAM GOD", "ARAM KING", "ARAM PRINCE", "ARAM DUKE", 
    "ARAM KNIGHT", "ARAM SQUIRE", "ARAM PEASANT", "ARAM MINION"
];

function cerrarAviso() {
    document.getElementById('overlay-mantenimiento').style.display = 'none';
}

function cambiarModo(modo) {
    modoActual = modo;
    
    // NUEVO: Cambia la URL en el navegador sin recargar (ej: /#flex)
    window.history.pushState(null, '', '#' + modo);

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${modo}`).classList.add('active');
    if (modo === 'aram') {
        document.getElementById('aram-aviso').style.display = 'block';
    } else {
        document.getElementById('aram-aviso').style.display = 'none';
    }

    // Oculta el Scouter y deselecciona al cambiar de pestaña
    jugadorSeleccionado = null;
    document.getElementById('seccion-scouter').style.display = 'none';

    // NUEVO: Resetear el panel de estadísticas al estado por defecto
    const panelStats = document.getElementById('panel-estadisticas');
    if (panelStats) {
        panelStats.innerHTML = `
            <div style="color: var(--color-subtexto); text-align: center; width: 100%;">
                <span style="font-size: 2rem;">👆</span><br>
                <b style="font-size: 1.1rem; color: white;">Seleccioná a un Quesito</b><br>
                para ver su Desempeño y Maestrías
            </div>
        `;
    }

    renderizarTabla();
    actualizarGrafica();
}

function renderizarTabla() {
    const tbody = document.getElementById('lista-jugadores-body');
    tbody.innerHTML = '';
    if (datosGlobales.length === 0) return;

    const mostrarSmurfs = document.getElementById('filtro-smurf') ? document.getElementById('filtro-smurf').checked : true;
    const filtroJugador = document.getElementById('filtro-jugador') ? document.getElementById('filtro-jugador').value : 'TODOS';

    let jugadoresA_Mostrar = datosGlobales;
    
    // 1. Filtrar por Smurfs activas/desactivas
    if (!mostrarSmurfs) {
        jugadoresA_Mostrar = jugadoresA_Mostrar.filter(j => j.is_main);
    }

    // 2. Filtrar por dueño específico
    if (filtroJugador !== 'TODOS') {
        jugadoresA_Mostrar = jugadoresA_Mostrar.filter(j => j.nombre === filtroJugador || j.propietario === filtroJugador);
    }

    jugadoresA_Mostrar.sort((a, b) => b[modoActual].puntos_grafica - a[modoActual].puntos_grafica);

    jugadoresA_Mostrar.forEach((j, i) => {
        const stats = j[modoActual];
        const isAram = modoActual === 'aram';
        const color = getComputedStyle(document.documentElement).getPropertyValue(`--color-${stats.tier.toLowerCase()}`).trim() || '#8c52ff';
        const icon = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${stats.tier.toLowerCase()}.png`;

        const tr = document.createElement('tr');
        tr.className = 'fila-jugador';
        
        // Memoria de selección
        if (jugadorSeleccionado && jugadorSeleccionado.puuid === j.puuid) {
            tr.classList.add('seleccionada');
        }

        tr.onclick = () => {
            jugadorSeleccionado = j;
            document.querySelectorAll('.fila-jugador').forEach(f => f.classList.remove('seleccionada'));
            tr.classList.add('seleccionada');
            mostrarScouter(j);
        };

        // Sacamos el ID del icono (si el backend lo manda como profileIconId, sino usamos el 29 por defecto)
        const iconId = j.profileIconId || 29; 
        const profileIconUrl = `https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/profileicon/${iconId}.png`;

        tr.innerHTML = `
            <td style="color:var(--amarillo-pro); font-weight:800">${i + 1}</td>
            <td>
                <div class="jugador-perfil-container">
                    <img src="${profileIconUrl}" class="perfil-icono" alt="Icono de ${j.nombre}">
                    <div class="jugador-info-text">
                        <div>
                            <span style="color:white; font-weight:bold; font-size:1.1rem;">${j.nombre}</span> 
                            <span style="color:gray; font-weight:normal; font-size:0.9rem;">#${j.tag}</span>
                        </div>
                        ${!j.is_main ? `<small style="color: var(--color-gold); font-size: 0.75rem; font-weight: bold; background: rgba(212, 181, 92, 0.1); padding: 2px 6px; border-radius: 4px; display: inline-block; margin: 2px 0; width: fit-content;">Smurf de ${j.propietario}</small>` : ''}
                        <small style="color:gray; font-size:0.7rem; text-transform:uppercase;">ÚLTIMA: ${stats.last_game || '---'}</small>
                    </div>
                </div>
            </td>
            <td style="color:gray;"><b>${isAram ? stats.total_partidas : (stats.wins + stats.losses)}</b> <span style="font-size:0.8em">PJs</span></td>
            <td>
                <div class="col-rango-completo">
                    <div class="contenedor-icono-fijo">${!isAram && stats.tier !== "UNRANKED" ? `<img src="${icon}" class="rank-icon">` : ''}</div>
                    <div class="rank-info-texto rank-${stats.tier}">
                        ${isAram ? `<div class="lp-text-centered" style="color: var(--amarillo-pro); font-size: 1rem;">${ARAM_TITLES[i] || "ARAM NOOB"}</div>` : 
                        `<div class="lp-progress-container"><div class="lp-progress-fill" style="width: ${Math.min(stats.lp, 100)}%; background-color: ${color}"></div><div class="lp-text-centered">${stats.tier} ${stats.rank} - ${stats.lp} LP</div></div>`}
                    </div>
                </div>
            </td>
            <td style="text-align:right"><b>${stats.wr}%</b><br><small style="color:var(--color-subtexto); font-size:0.7em">${stats.wins}W / ${stats.losses}L</small></td>
        `;
        tbody.appendChild(tr);
    });
}

// --- PLUGIN PERSONALIZADO PARA PINTAR LOS FONDOS DE LAS LIGAS ---
const fondoLigasPlugin = {
    id: 'fondoLigas',
    beforeDraw: (chart) => {
        const { ctx, chartArea: { top, bottom, left, right }, scales: { y } } = chart;
        
        const ligas = [
            { nombre: "C", min: 9000, color: "rgba(255, 215, 0, 0.05)" },
            { nombre: "GM", min: 8000, color: "rgba(255, 0, 0, 0.05)" },
            { nombre: "M", min: 7000, color: "rgba(128, 0, 128, 0.05)" },
            { nombre: "D", min: 6000, color: "rgba(87, 101, 242, 0.05)" },
            { nombre: "E", min: 5000, color: "rgba(42, 221, 156, 0.05)" },
            { nombre: "P", min: 4000, color: "rgba(75, 202, 235, 0.05)" },
            { nombre: "G", min: 3000, color: "rgba(242, 175, 66, 0.05)" },
            { nombre: "S", min: 2000, color: "rgba(160, 160, 160, 0.05)" },
            { nombre: "B", min: 1000, color: "rgba(205, 127, 50, 0.05)" },
            { nombre: "I", min: 0, color: "rgba(81, 72, 60, 0.05)" }
        ];

        ctx.save();
        ligas.forEach((liga, i) => {
            const yTop = y.getPixelForValue(ligas[i-1] ? ligas[i-1].min : 10000); 
            const yBottom = y.getPixelForValue(liga.min);

            if (yTop < bottom && yBottom > top) {
                ctx.fillStyle = liga.color;
                ctx.fillRect(left, Math.max(top, yTop), right - left, Math.min(bottom, yBottom) - Math.max(top, yTop));
                
                ctx.beginPath();
                ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; 
                ctx.setLineDash([5, 5]); 
                ctx.moveTo(left, yBottom);
                ctx.lineTo(right, yBottom);
                ctx.stroke();

                ctx.fillStyle = liga.color.replace('0.05', '0.5'); 
                ctx.font = "bold 12px Arial";
                ctx.fillText(liga.nombre, left + 5, yBottom - 5);
            }
        });
        ctx.restore();
    }
};

function actualizarGrafica() {
    const ctx = document.getElementById('graficoElo').getContext('2d');
    if (miGrafica) miGrafica.destroy();
    
    const hoy = new Date().toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit'});
    datosGlobales.forEach(j => {
        if (j.historiales && j.historiales[modoActual] && j.historiales[modoActual].length === 0 && j[modoActual].tier !== "UNRANKED") {
            j.historiales[modoActual].push({ fecha: hoy, puntos: j[modoActual].puntos_grafica });
        }
    });

    const mostrarSmurfs = document.getElementById('filtro-smurf') ? document.getElementById('filtro-smurf').checked : true;
    const filtroJugador = document.getElementById('filtro-jugador') ? document.getElementById('filtro-jugador').value : 'TODOS';

    let jugadoresA_Mostrar = datosGlobales;
    if (!mostrarSmurfs) jugadoresA_Mostrar = jugadoresA_Mostrar.filter(j => j.is_main);
    if (filtroJugador !== 'TODOS') jugadoresA_Mostrar = jugadoresA_Mostrar.filter(j => j.nombre === filtroJugador || j.propietario === filtroJugador);

    const jugadoresConHistorial = jugadoresA_Mostrar.filter(j => j.historiales && j.historiales[modoActual] && j.historiales[modoActual].length > 0);
    if (jugadoresConHistorial.length === 0) return;

    // FIX GRÁFICA INDEPENDIENTE: Buscamos el máximo de partidas jugadas para el eje X
    let maxPartidas = 0;
    
    const datasets = jugadoresConHistorial.map(j => {
        const colorJugador = obtenerColor(j.nombre);
        const historial = j.historiales[modoActual];
        if (historial.length > maxPartidas) maxPartidas = historial.length;

        // Creamos objetos {x, y} para que Chart.js los acomode exactamente donde van
        const dataPuntos = historial.map((h, i) => ({
            x: i, 
            y: h.puntos,
            fechaOriginal: h.fecha // Guardamos la fecha para el Tooltip
        }));

        return {
            label: j.nombre,
            data: dataPuntos,
            borderColor: colorJugador,
            backgroundColor: colorJugador,
            borderWidth: 3,       
            pointRadius: 2,       
            pointHoverRadius: 7,  
            tension: 0.4,         
            spanGaps: true 
        };
    });

    // Creamos etiquetas numéricas del 0 al maxPartidas para el eje X
    const labels = Array.from({length: maxPartidas}, (_, i) => i);

   miGrafica = new Chart(ctx, { 
        type: 'line', 
        data: { labels, datasets }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            layout: { padding: { top: 15, right: 20 } },
            normalized: true, 
            animation: { duration: 800, easing: 'easeOutQuart' },
            interaction: { mode: 'nearest', intersect: false },
            scales: {
                y: {
                    suggestedMin: 1000, 
                    suggestedMax: 6000,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { display: false }
                },
                x: {
                    type: 'linear',
                    min: 0,
                    max: maxPartidas > 1 ? maxPartidas - 1 : 1, // <--- ESTA ES LA MAGIA: Si hay 1 solo punto, fuerza el gráfico a mostrarlo
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { display: false } 
                }
            },
            plugins: { 
                legend: { 
                    position: 'top',
                    labels: { color: '#9ca3af', usePointStyle: true, boxWidth: 6, boxHeight: 6, padding: 15, font: { size: 11 } } 
                },
                tooltip: {
                    animation: { duration: 150 }, 
                    callbacks: {
                        title: () => null, 
                        label: function(context) {
                            // Extraemos la fecha del objeto {x, y, fechaOriginal}
                            const rawData = context.raw;
                            return `${context.dataset.label} (${rawData.fechaOriginal}): ${decodificarPuntos(rawData.y)}`;
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'xy', threshold: 5 }, 
                    zoom: { wheel: { enabled: true }, drag: false, pinch: { enabled: true }, mode: 'xy' }
                }
            } 
        },
        plugins: [fondoLigasPlugin]
    });
}

// Helper para buscar la imagen exacta de la runa
function getRuneIcon(id) {
    if (!runesData || !runesData.length) return '';
    for (let tree of runesData) {
        if (tree.id === id) return `https://ddragon.leagueoflegends.com/cdn/img/${tree.icon}`;
        for (let slot of tree.slots) {
            for (let rune of slot.runes) {
                if (rune.id === id) return `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`;
            }
        }
    }
    return '';
}

let scouterOffset = 0; // Guardamos por qué página vamos

function mostrarScouter(j) {
    scouterOffset = 0; // Reseteamos al buscar a alguien nuevo
    const scouterSection = document.getElementById('seccion-scouter');
    const panelStats = document.getElementById('panel-estadisticas'); 
    const lista = document.getElementById('lista-partidas');
    
    scouterSection.style.display = 'block';
    scouterSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    document.getElementById('scouter-nombre').innerHTML = `🔎 HISTORIAL DE AUTISMO <span class="highlight">// ${j.nombre}</span> <span style="font-size: 0.8rem; color: gray; margin-left: 10px;">(Cargando...)</span>`;
    lista.innerHTML = '<div style="color:var(--amarillo-pro); text-align:center; padding: 20px;">Analizando historial en tiempo real...</div>';
    panelStats.innerHTML = '<div style="color:var(--amarillo-pro); text-align:center; width: 100%;">Cargando datos del jugador...</div>'; 

    cargarPartidasScouter(j, 0); // Cargamos la primera página
}

function cargarPartidasScouter(j, offset) {
    const isAram = modoActual === 'aram';
    const lista = document.getElementById('lista-partidas');
    const panelStats = document.getElementById('panel-estadisticas');
    
    // Si estamos cargando más, avisamos en el botón
    if (offset > 0) {
        const btn = document.getElementById('btn-cargar-mas');
        if (btn) btn.textContent = "Cargando partidas...";
    }

    fetch(`${API_URL}/api/scouter/${j.puuid}/${modoActual}/${offset}`)
        .then(res => res.json())
        .then(data => {
            const partidas = data.partidas || [];
            const maestrias = data.maestrias || [];

            if (offset === 0) {
                document.getElementById('scouter-nombre').innerHTML = `🔎 HISTORIAL DE AUTISMO <span class="highlight">// ${j.nombre}</span>`;
                lista.innerHTML = ''; 
                if (partidas.length === 0) {
                    lista.innerHTML = '<div style="color:gray; text-align:center; padding:20px;">No se encontraron partidas.</div>';
                    return;
                }
            } else {
                // Removemos el botón viejo para ponerlo al fondo después
                const btnViejo = document.getElementById('btn-cargar-mas');
                if (btnViejo) btnViejo.remove();
                if (partidas.length === 0) return; // Si no hay más, no hace nada
            }

            // --- ESTADÍSTICAS GLOBALES PARA EL PANEL (Solo las calculamos en la primera carga) ---
            if (offset === 0) {
                let tk = 0, td = 0, ta = 0, twins = 0;
                let rolesCount = {};
                let compañeros = {}; 
                let totalCS = 0;
                let totalSegundos = 0;
                const champFix = (cName) => cName === 'FiddleSticks' ? 'Fiddlesticks' : cName;

                // LOS CAMPEONES CHIQUITOS QUE VUELVEN
                const ultimosChampsHtml = partidas.map(p => {
                    const borderColor = p.remake ? '#9ca3af' : (p.win ? '#2add9c' : '#f25757');
                    return `<img src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/champion/${champFix(p.champ)}.png" 
                            style="width:25px; height:25px; border-radius:50%; border: 2px solid ${borderColor}; box-shadow: 0 0 5px ${borderColor}80;" 
                            title="${p.champ} (${p.remake ? 'Remake' : (p.win ? 'Victoria' : 'Derrota')})">`;
                }).join('');

                const nombresAmigos = datosGlobales.map(x => x.nombre.toLowerCase());
                const esAmigo = (nombre) => nombresAmigos.includes(nombre.toLowerCase()) && nombre.toLowerCase() !== j.nombre.toLowerCase();

                partidas.forEach(p => {
                    tk += p.k; td += p.d; ta += p.a;
                    if (p.win) twins++;
                    totalCS += p.cs;
                    
                    let parts = p.duracion.split(':');
                    totalSegundos += (parseInt(parts[0]) * 60) + parseInt(parts[1]);

                    let r = p.role || 'none';
                    if (r !== 'none' && r !== 'ARAM' && !isAram) rolesCount[r] = (rolesCount[r] || 0) + 1;

                    const miEquipo = p.team1.some(jug => jug.name === j.nombre) ? p.team1 : p.team2;
                    miEquipo.forEach(jug => {
                        if (jug.name !== j.nombre) compañeros[jug.name] = (compañeros[jug.name] || 0) + 1;
                    });
                });

                // Cálculos de Farmeo y KDA
                const csMin = totalSegundos > 0 ? (totalCS / (totalSegundos / 60)).toFixed(1) : 0;
                const avgSegundos = totalSegundos / (partidas.length || 1);
                const avgMin = Math.floor(avgSegundos / 60);
                const avgSec = Math.floor(avgSegundos % 60).toString().padStart(2, '0');

                const kdaNum = td === 0 ? "Perfecto" : ((tk + ta) / td).toFixed(2);
                const wrNum = Math.round((twins / partidas.length) * 100);
                
                const opggRoles = { 'middle': 'mid', 'jungle': 'jungle', 'bottom': 'adc', 'utility': 'support', 'top': 'top' };
                const roleMappingText = { 'middle': 'Mid', 'jungle': 'Jungla', 'bottom': 'ADC', 'utility': 'Support', 'top': 'Top' };
                
                const favRoleKey = Object.keys(rolesCount).length > 0 ? Object.keys(rolesCount).reduce((a, b) => rolesCount[a] > rolesCount[b] ? a : b) : null;
                const favRole = favRoleKey ? roleMappingText[favRoleKey.toLowerCase()] : (isAram ? 'ARAM' : 'Polivalente');
                const opggRoleKey = favRoleKey ? opggRoles[favRoleKey.toLowerCase()] : null;
                const roleIconSvg = opggRoleKey && !isAram ? `<img src="https://s-lol-web.op.gg/images/icon/icon-position-${opggRoleKey}.svg" style="width:16px; vertical-align: middle; margin-left: 6px; filter: drop-shadow(0 0 2px rgba(0,0,0,0.8));">` : '';

                // Lógica del Mejor Dúo (con contador y color de amigo)
                let mejorDuo = "Lobo Solitario";
                let maxPartidasDuo = 0;
                for (const [nom, cant] of Object.entries(compañeros)) {
                    if (cant > maxPartidasDuo && cant >= 2) { 
                        mejorDuo = nom;
                        maxPartidasDuo = cant;
                    }
                }
                const colorDuo = esAmigo(mejorDuo) ? '#4bcaeb' : 'var(--color-gold)';
                const duoTextHtml = maxPartidasDuo >= 2 
                    ? `<span style="color:${colorDuo}; font-weight:bold;">${mejorDuo} <span style="color:gray; font-size:0.75rem;">(${maxPartidasDuo} PJs)</span></span>` 
                    : `<span style="color:var(--color-subtexto); font-weight:bold;">🐺 Lobo Solitario</span>`;

                // --- HUMOR NEGRO ---
                let tagVibe = "";
                if (kdaNum >= 3.5 && wrNum >= 60) tagVibe = '<span style="background:rgba(42, 221, 156, 0.2); color:#2add9c; padding:4px 8px; border-radius:4px; font-weight:bold;">🗿 Carreador de Autistas</span>';
                else if (kdaNum <= 1.0) tagVibe = '<span style="background:rgba(242, 87, 87, 0.2); color:#f25757; padding:4px 8px; border-radius:4px; font-weight:bold;">💩 Malo de Mierda</span>';
                else if (td >= 10) tagVibe = '<span style="background:rgba(242, 87, 87, 0.2); color:#f25757; padding:4px 8px; border-radius:4px; font-weight:bold;">💣 Terrorista Aliado</span>';
                else if (wrNum <= 30) tagVibe = '<span style="background:rgba(242, 87, 87, 0.2); color:#f25757; padding:4px 8px; border-radius:4px; font-weight:bold;">♿ Free Elo Móvil</span>';
                else if (kdaNum < 2.0 && wrNum >= 60) tagVibe = '<span style="background:rgba(212, 181, 92, 0.2); color:var(--color-gold); padding:4px 8px; border-radius:4px; font-weight:bold;">🚌 Pasajero VIP (Carreado)</span>';
                else if (wrNum >= 60) tagVibe = '<span style="background:rgba(212, 181, 92, 0.2); color:var(--color-gold); padding:4px 8px; border-radius:4px; font-weight:bold;">📈 Farmeando LP</span>';
                else tagVibe = '<span style="background:#2d3748; color:white; padding:4px 8px; border-radius:4px; font-weight:bold;">🤷‍♂️ Rellenando Partidas</span>';

                let maestriasHtml = '';
                if (maestrias.length > 0) {
                    const ordenIndices = [1, 0, 2]; 
                    let podioHtml = '';
                    ordenIndices.forEach(idx => {
                        if (maestrias[idx]) {
                            const m = maestrias[idx];
                            const isTop1 = idx === 0;
                            const size = isTop1 ? '70px' : '50px';
                            const borderColor = isTop1 ? '#d4b55c' : (idx === 1 ? '#a0a0a0' : '#cd7f32'); 
                            const orderCSS = isTop1 ? 2 : (idx === 1 ? 1 : 3);
                            podioHtml += `
                                <div style="display:flex; flex-direction:column; align-items:center; margin: 0 10px; order: ${orderCSS};">
                                    <div style="position: relative;">
                                        <img src="https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${champFix(m.championId)}.png" 
                                             style="width:${size}; height:${size}; border-radius:50%; border:3px solid ${borderColor}; box-shadow: 0 0 15px ${borderColor}40; object-fit: cover;">
                                        ${isTop1 ? '<div style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); font-size:1.2rem;">👑</div>' : ''}
                                    </div>
                                    <b style="color:white; font-size: ${isTop1 ? '0.9rem' : '0.8rem'}; margin-top: 5px;">Lvl ${m.championLevel}</b>
                                    <small style="color:var(--color-subtexto); font-size:0.7rem;">${(m.championPoints/1000).toFixed(1)}k</small>
                                </div>
                            `;
                        }
                    });
                    maestriasHtml = `<div style="display:flex; justify-content:center; align-items:flex-end; width:100%; padding: 10px 0;">${podioHtml}</div>`;
                }

                // HEADER CON ICONO DE RANGO GIGANTE
                const iconId = j.profileIconId || 29;
                const profileIconUrl = `https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/profileicon/${iconId}.png`;
                const tierActual = j[modoActual].tier;
                const infoExtra = !isAram && tierActual !== "UNRANKED" ? `<span class="rank-${tierActual}" style="font-weight: 800;">${tierActual} ${j[modoActual].rank}</span> - <span style="color:white">${j[modoActual].lp} LP</span>` : (isAram ? 'Estadísticas Generales' : 'Unranked');
                
                const rankIconUrl = !isAram && tierActual !== "UNRANKED" ? `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tierActual.toLowerCase()}.png` : '';
                
                // FIX: Le metemos un scale(3.5) para saltarnos el fondo transparente de Riot y que el escudo se vea imponente
                const rankIconHtml = rankIconUrl ? `<img src="${rankIconUrl}" style="width: 80px; height: 80px; object-fit: contain; filter: drop-shadow(0 0 8px rgba(0,0,0,0.5)); margin-left: auto; margin-right: 10px; transform: scale(3.5); pointer-events: none;">` : '';

                const headerHtml = `
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 5px; background: #1c1f26; padding: 15px; border-radius: 10px; border: 1px solid #2d3748; overflow: hidden;">
                        <img src="${profileIconUrl}" style="width: 55px; height: 55px; border-radius: 50%; border: 2px solid var(--amarillo-pro); box-shadow: 0 0 10px rgba(212, 181, 92, 0.2);">
                        <div style="z-index: 2;">
                            <div style="font-size: 1.25rem; font-weight: 900; color: white;">${j.nombre} <span style="color: gray; font-size: 0.9rem; font-weight: 500;">#${j.tag}</span></div>
                            <div style="font-size: 0.85rem; color: var(--color-subtexto); margin-top: 3px;">
                                ${!j.is_main ? `<span style="color: var(--color-gold); font-weight: bold;">Smurf de ${j.propietario}</span> • ` : ''}
                                ${infoExtra}
                            </div>
                        </div>
                        ${rankIconHtml}
                    </div>
                `;

                // CONSTRUCCIÓN DEL PANEL
                panelStats.innerHTML = `
                    <div class="scouter-stats-container">
                        
                        ${headerHtml}

                        <div class="stat-box" style="border-left-color: var(--amarillo-pro)">
                            <span style="color:var(--color-subtexto); font-size:0.8rem; font-weight:bold; text-transform:uppercase; display:block; text-align:center; margin-bottom: 10px;">🏆 Campeones Más Jugados</span>
                            ${maestriasHtml || '<div style="color:gray; font-size:0.9rem; text-align:center;">Sin datos de maestría.</div>'}
                        </div>
                        
                        <div style="text-align: center; margin: 15px 0 5px 0; border-bottom: 1px solid #2d3748; line-height: 0.1em;">
                            <span style="background: var(--bg-tarjeta); padding: 0 15px; color: var(--color-subtexto); font-size: 0.75rem; font-weight: bold; text-transform: uppercase;">Análisis de las últimas ${partidas.length} partidas</span>
                        </div>

                        <div class="stat-box" style="border-left-color: ${kdaNum >= 3 ? 'var(--color-emerald)' : '#f25757'}">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <span style="color:var(--color-subtexto); font-size:0.75rem; font-weight:bold; text-transform:uppercase;">🔥 Desempeño</span><br>
                                    <div style="font-size:1.8rem; font-weight:900; color:white; line-height: 1; margin-top: 3px;">${kdaNum} KDA</div>
                                    <span style="color:var(--color-gold); font-size:0.8rem;">${tk} / ${td} / ${ta}</span>
                                </div>
                                <div style="text-align: right;">
                                    <div class="role-badge" style="background: ${wrNum >= 50 ? 'rgba(42, 221, 156, 0.2)' : 'rgba(242, 87, 87, 0.2)'}; color: ${wrNum >= 50 ? 'var(--color-emerald)' : '#f25757'}; margin-bottom: 5px;">WR: ${wrNum}%</div><br>
                                    <div class="role-badge" style="margin: 0; display: inline-flex; align-items: center;">Rol (Últ. ${partidas.length}): ${favRole} ${roleIconSvg}</div>
                                </div>
                            </div>
                        </div>

                        <div class="stat-box" style="border-left-color: #5765f2">
                            <span style="color:var(--color-subtexto); font-size:0.75rem; font-weight:bold; text-transform:uppercase; display:block; margin-bottom: 8px;">📊 Radar de Quesito</span>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <div style="display:flex; justify-content: space-between; align-items:center;">
                                    <span style="color:white; font-size:0.85rem;">Farmeo Promedio:</span>
                                    <b style="color:white; font-size:0.85rem;">${csMin} <span style="color:gray; font-size:0.7rem;">CS/M</span></b>
                                </div>
                                <div style="display:flex; justify-content: space-between; align-items:center;">
                                    <span style="color:white; font-size:0.85rem;">Duración Promedio:</span>
                                    <b style="color:white; font-size:0.85rem;">${avgMin}:${avgSec} <span style="color:gray; font-size:0.7rem;">MIN</span></b>
                                </div>
                                <div style="display:flex; justify-content: space-between; align-items:center;">
                                    <span style="color:white; font-size:0.85rem;">Mejor Dúo:</span>
                                    ${duoTextHtml}
                                </div>
                                <div style="display:flex; justify-content: space-between; align-items:center; margin-top: 2px;">
                                    <span style="color:white; font-size:0.85rem;">Estado:</span>
                                    ${tagVibe}
                                </div>
                            </div>
                        </div>

                        <div class="stat-box" style="border-left-color: #4bcaeb; padding: 12px;">
                            <span style="color:var(--color-subtexto); font-size:0.75rem; font-weight:bold; text-transform:uppercase; display:block; margin-bottom: 8px; text-align: center;">🎮 Selecciones Recientes</span>
                            <div style="display: flex; gap: 5px; justify-content: center; flex-wrap: nowrap;">
                                ${ultimosChampsHtml}
                            </div>
                        </div>
                    </div>
                `;
            }

            // --- INYECCIÓN DE CARTAS DE PARTIDAS (NUEVA LÓGICA AGRUPADA) ---
            const divPartidas = offset === 0 ? document.createElement('div') : lista.querySelector('.contenedor-partidas-append');
            if (offset === 0) {
                divPartidas.className = "contenedor-partidas-append";
                lista.appendChild(divPartidas);
            }

            const champFix = (cName) => cName === 'FiddleSticks' ? 'Fiddlesticks' : cName;
            const nombresAmigos = datosGlobales.map(x => x.nombre.toLowerCase());
            const esAmigo = (nombre) => nombresAmigos.includes(nombre.toLowerCase()) && nombre.toLowerCase() !== j.nombre.toLowerCase();

            // PASO 1: Agrupamos las partidas por fecha primero y calculamos el PL Total del día
            const partidasPorDia = {};
            partidas.forEach(p => {
                const fechaCorta = p.fecha.split(' ')[0];
                if (!partidasPorDia[fechaCorta]) {
                    partidasPorDia[fechaCorta] = { balance: 0, matches: [] };
                }
                partidasPorDia[fechaCorta].matches.push(p);
                partidasPorDia[fechaCorta].balance += (p.lp_change || 0); // Sumamos los puntos o 0 si es remake/calibrando
            });

            // PASO 2: Dibujamos en la pantalla día por día (Cartel Primero, Cartas Después)
            for (const [fecha, datosDia] of Object.entries(partidasPorDia)) {
                
                // 1. Insertamos el banner del día ARRIBA de las cartas
                insertarBannerDiario(divPartidas, fecha, datosDia.balance);

                // 2. Ahora sí, dibujamos las cartas de ese día
                datosDia.matches.forEach((p) => {
                    const isRemake = p.remake;
                    const textoResultado = isRemake ? 'Remake' : (p.win ? 'Victoria' : 'Derrota');
                    const colorResultado = isRemake ? '#9ca3af' : (p.win ? '#2add9c' : '#f25757');
                    const card = document.createElement('div');
                    card.className = `match-card ${isRemake ? 'remake' : (p.win ? 'win' : 'loss')}`;
                    
                    const generarEquipoHtml = (equipo) => equipo.map(pl => {
                        const extraClass = pl.name === j.nombre ? 'me' : (esAmigo(pl.name) ? 'quesito' : '');
                        return `<div class="player-row ${extraClass}"><img src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/champion/${champFix(pl.champ)}.png" onerror="this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/-1.png'"><b>${pl.name}</b></div>`;
                    }).join('');

                    const team1Html = generarEquipoHtml(p.team1);
                    const team2Html = generarEquipoHtml(p.team2);

                    const normalItems = p.items.slice(0, 6).map(id => {
                        const url = id > 0 ? `https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/item/${id}.png` : '';
                        return `<div class="m-item-box">${url ? `<img src="${url}">` : ''}</div>`;
                    }).join('');
                    const trinketId = p.items[6];
                    const trinketUrl = trinketId > 0 ? `https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/item/${trinketId}.png` : '';
                    
                    const pos = p.role ? p.role.toLowerCase() : 'none';
                    const opggRoles = { 'middle': 'mid', 'jungle': 'jungle', 'bottom': 'adc', 'utility': 'support', 'top': 'top' };
                    const matchOpggRole = opggRoles[pos];
                    const posIcon = matchOpggRole && !isAram ? `https://s-lol-web.op.gg/images/icon/icon-position-${matchOpggRole}.svg` : '';
                    
                    const fixSum = (s) => String(s).replace('Ignite', 'Dot');
                    const primaryRuneIcon = getRuneIcon(p.runes ? p.runes[0] : 0);
                    const secondaryRuneIcon = getRuneIcon(p.runes ? p.runes[1] : 0);
                    const r1Html = primaryRuneIcon ? `<img class="m-rune primary" src="${primaryRuneIcon}">` : `<div class="m-rune primary placeholder"></div>`;
                    const r2Html = secondaryRuneIcon ? `<img class="m-rune secondary" src="${secondaryRuneIcon}">` : `<div class="m-rune secondary placeholder"></div>`;

                    let lpHtml = '';
                    if (!isAram) {
                        if (isRemake) lpHtml = `<br><span style="color: var(--color-subtexto); font-weight: bold; font-size: 0.8rem;">- LP</span>`;
                        else if (p.lp_change === null || p.lp_change === undefined) lpHtml = `<br><span style="color: var(--color-subtexto); font-size: 0.8rem;">Calibrando PL...</span>`;
                        else if (p.lp_change === 0) lpHtml = `<br><span style="color: var(--color-subtexto); font-weight: bold; font-size: 0.8rem;">0 LP</span>`;
                        else {
                            const lpSign = p.lp_change > 0 ? '+' : '';
                            const lpClass = p.lp_change > 0 ? 'lp-gain' : 'lp-loss';
                            lpHtml = `<br><span class="${lpClass}">${lpSign}${p.lp_change} LP</span>`;
                        }
                    }

                    card.innerHTML = `
                        <div class="m-info">
                            <b style="color:${colorResultado}">${textoResultado}</b>
                            <span style="color: var(--amarillo-pro); font-weight: bold; font-size: 0.75rem;">${p.queue_name}</span><br>
                            ${p.fecha} • ${p.duracion}
                            ${lpHtml}
                        </div>
                        <div class="m-champ-block">
                            <div class="m-champ-img-container">
                                <img class="main-champ" src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/champion/${champFix(p.champ)}.png" onerror="this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/-1.png'">
                                <span class="m-lvl">${p.lvl}</span>
                                ${posIcon ? `<div class="role-icon-container"><img src="${posIcon}" class="role-icon"></div>` : ''}
                            </div>
                            <div class="m-spells-runes">
                                <div class="m-sr-col">
                                    <img class="m-spell" src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/spell/${p.summoners ? fixSum(p.summoners[0]) : 'SummonerFlash'}.png">
                                    <img class="m-spell" src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/spell/${p.summoners ? fixSum(p.summoners[1]) : 'SummonerDot'}.png">
                                </div>
                                <div class="m-sr-col">${r1Html}${r2Html}</div>
                            </div>
                        </div>
                        <div class="m-stats">
                            <div class="m-kda">${p.k} / <span style="color:#f25757">${p.d}</span> / ${p.a}</div>
                            <div class="m-cs">${p.cs} CS</div>
                        </div>
                        <div class="m-items-container">
                            <div class="m-items">${normalItems}</div>
                            <div class="m-trinket-box">${trinketUrl ? `<img src="${trinketUrl}">` : ''}</div>
                        </div>
                        <div class="m-teams">
                            <div class="team-col">${team1Html}</div>
                            <div class="team-col">${team2Html}</div>
                        </div>
                    `;
                    divPartidas.appendChild(card);
                });
            }

            // Si trajimos 10, probablemente haya más, así que creamos el botón al final
            if (partidas.length === 10) {
                const btnCargar = document.createElement('button');
                btnCargar.id = 'btn-cargar-mas';
                btnCargar.className = 'btn-cargar-mas';
                btnCargar.innerHTML = `⬇ Cargar Partidas Anteriores (${offset + 10} - ${offset + 20})`;
                btnCargar.onclick = () => {
                    scouterOffset += 10;
                    cargarPartidasScouter(j, scouterOffset);
                };
                lista.appendChild(btnCargar);
            }
        })
        .catch(err => {
            if (offset === 0) lista.innerHTML = '<div style="color:#f25757; text-align:center; padding: 20px;">Error al cargar las partidas.</div>';
            const btn = document.getElementById('btn-cargar-mas');
            if (btn) btn.textContent = "Error de red. Reintentar.";
        });
}

// Función auxiliar para crear el cartelito de balance
function insertarBannerDiario(contenedor, fecha, balance) {
    const banner = document.createElement('div');
    banner.className = 'resumen-diario';
    
    const colorBalance = balance > 0 ? '#2add9c' : (balance < 0 ? '#f25757' : '#9ca3af');
    const signo = balance > 0 ? '+' : '';
    
    banner.innerHTML = `
        <div class="fecha-label">RESUMEN DEL DÍA ${fecha}</div>
        <div class="balance-total" style="color: ${colorBalance}">
            TOTAL: ${signo}${balance} LP
        </div>
    `;
    
    // Lo insertamos ANTES de las partidas de ese día (o después, según prefieras el orden)
    // En este caso, para que quede abajo de las partidas del día, simplemente lo agregamos al final
    contenedor.appendChild(banner);
}

document.getElementById('update-time').textContent = "SINCRONIZANDO PARCHE..."; 

fetch("https://ddragon.leagueoflegends.com/api/versions.json")
    .then(res => res.json())
    .then(versions => {
        LOL_VER = versions[0]; 
        return fetch(`https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/data/es_AR/runesReforged.json`);
    })
    .then(res => res.json())
    .then(data => {
        runesData = data; 
        iniciarLeaderboard();
    })
    .catch(() => {
        iniciarLeaderboard();
    });

let cooldownTimer = null;

// --- SISTEMA DE COOLDOWN DEL BOTÓN ---
function iniciarCooldown(ultimaAct) {
    const btn = document.getElementById('btn-actualizar');
    clearInterval(cooldownTimer);
    
    cooldownTimer = setInterval(() => {
        const ahora = Math.floor(Date.now() / 1000);
        const pasado = ahora - ultimaAct;
        const restante = 300 - pasado; // 5 minutos exactos (300 segs)
        
        if (restante > 0) {
            btn.disabled = true;
            const mins = Math.floor(restante / 60);
            const secs = Math.floor(restante % 60); // <-- ACÁ ESTÁ EL FIX
            btn.textContent = `Actualizar en ${mins}:${secs.toString().padStart(2, '0')}`;
        } else {
            btn.disabled = false;
            btn.textContent = "Actualizar Datos";
            clearInterval(cooldownTimer);
        }
    }, 1000); // Se actualiza cada 1 segundo
}

function forzarActualizacion() {
    const btn = document.getElementById('btn-actualizar');
    btn.disabled = true;
    btn.textContent = "Actualizando con Riot...";
    
    document.getElementById('update-time').textContent = "CALCULANDO NUEVOS PUNTOS..."; 
    document.getElementById('pantalla-carga').style.display = 'flex';
    document.getElementById('pantalla-carga').style.opacity = '1';

    // LLAMA A LA PUERTA PESADA (/api/update)
    fetch(`${API_URL}/api/update`)
        .then(res => res.json())
        .then(d => { 
            if (d.jugadores && d.jugadores.length > 0) datosGlobales = d.jugadores; 
            document.getElementById('update-time').textContent = "LEADERBOARD ONLINE"; 
            
            document.getElementById('pantalla-carga').style.opacity = '0'; 
            setTimeout(() => document.getElementById('pantalla-carga').style.display = 'none', 500);
            
            poblarFiltros();
            cambiarModo(modoActual); 
            if(d.ultima_actualizacion > 0) iniciarCooldown(d.ultima_actualizacion); 
        })
        .catch(() => {
            alert("Error al actualizar los datos con Riot.");
            btn.disabled = false;
            btn.textContent = "Actualizar";
            document.getElementById('pantalla-carga').style.opacity = '0'; 
            setTimeout(() => document.getElementById('pantalla-carga').style.display = 'none', 500);
        });
}

function iniciarLeaderboard() {
    // Lee la URL por si alguien te pasó un link directo tipo /#aram
    const hash = window.location.hash.replace('#', '');
    if (['soloq', 'flex', 'aram'].includes(hash)) {
        modoActual = hash;
    }

    document.getElementById('update-time').textContent = "OBTENIENDO DATOS RÁPIDOS..."; 
    document.getElementById('pantalla-carga').style.display = 'flex'; 
    document.getElementById('pantalla-carga').style.opacity = '1';
    
    // LLAMA A LA PUERTA RÁPIDA (/api/leaderboard)
    fetch(`${API_URL}/api/leaderboard`)
        .then(res => res.json())
        .then(d => { 
            if (d.jugadores && d.jugadores.length > 0) datosGlobales = d.jugadores; 
            
            document.getElementById('update-time').textContent = "LEADERBOARD ONLINE"; 
            cerrarAviso(); 
            
            document.getElementById('pantalla-carga').style.opacity = '0'; 
            setTimeout(() => document.getElementById('pantalla-carga').style.display = 'none', 500);
            
            poblarFiltros();
            cambiarModo(modoActual); 
            
            if(d.ultima_actualizacion > 0) iniciarCooldown(d.ultima_actualizacion); 
        })
        .catch(() => {
            document.getElementById('update-time').textContent = "SIN DATOS - ESPERA A RENDER";
            document.getElementById('pantalla-carga').innerHTML = '<h3 style="color:#f25757">Error al conectar. El servidor está dormido o falló.</h3>';
        });
}

// --- LÓGICA DE LA VENTANA DE AÑADIR CUENTA ---
function abrirModal() {
    document.getElementById('modal-agregar').style.display = 'flex';
}

function cerrarModal() {
    document.getElementById('modal-agregar').style.display = 'none';
    document.getElementById('nuevo-nombre').value = '';
    document.getElementById('nuevo-tag').value = '';
    document.getElementById('nuevo-ismain').checked = true;
}

// --- OBTENER VERSIÓN AUTOMÁTICA DE GITHUB ---
function obtenerVersionGithub() {
    // Le preguntamos a la API de GitHub por el último cambio en tu repositorio
    fetch("https://api.github.com/repos/lautharo/QuesitosAut-Leaderboard/commits/main")
        .then(res => res.json())
        .then(data => {
            if (data && data.sha) {
                // Sacamos los primeros 7 caracteres del código de subida (Commit Hash)
                const commitCorto = data.sha.substring(0, 7);
                
                // Buscamos el texto base que pusiste en el HTML
                const versionBase = document.getElementById('version-github').textContent;
                
                // Lo actualizamos sumándole el código automático de GitHub
                document.getElementById('version-github').textContent = `${versionBase} (Build ${commitCorto})`;
            }
        })
        .catch(err => console.log("No se pudo cargar el build de GitHub"));
}

// Ejecutamos la función apenas cargue el código
obtenerVersionGithub();

function guardarNuevaCuenta() {
    const nombre = document.getElementById('nuevo-nombre').value.trim();
    const tag = document.getElementById('nuevo-tag').value.trim();
    const isMain = document.getElementById('nuevo-ismain').checked;
    
    // NUEVO: Capturamos al dueño si la cuenta no es main
    const propietario = isMain ? null : document.getElementById('nuevo-propietario').value;

    if (!nombre || !tag) {
        alert("¡Epa! Por favor, completá el nombre y el tag.");
        return;
    }

    const btn = document.querySelector('#modal-agregar .btn-actualizar');
    btn.innerText = "Verificando en Riot...";
    btn.disabled = true;

    fetch(`${API_URL}/api/jugadores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // NUEVO: Agregamos el "propietario" al paquete que viaja a Python
        body: JSON.stringify({ nombre: nombre, tag: tag, is_main: isMain, propietario: propietario })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else {
            alert("¡Cuenta agregada con éxito!");
            cerrarModal();
            forzarActualizacion(); // Actualizamos la tabla
        }
    })
    .catch(err => {
        alert("Error de conexión con el servidor.");
    })
    .finally(() => {
        btn.innerText = "Guardar Jugador";
        btn.disabled = false;
    });
}

function togglePropietario() {
    const isMain = document.getElementById('nuevo-ismain').checked;
    const caja = document.getElementById('caja-propietario');
    const select = document.getElementById('nuevo-propietario');
    
    if (!isMain) {
        caja.style.display = 'block';
        select.innerHTML = '';
        datosGlobales.filter(j => j.is_main).forEach(j => {
            select.innerHTML += `<option value="${j.nombre}">${j.nombre}</option>`;
        });
    } else {
        caja.style.display = 'none';
    }
}

function poblarFiltros() {
    const select = document.getElementById('filtro-jugador');
    if (!select) return;
    const actual = select.value;
    select.innerHTML = '<option value="TODOS">Todos los Quesitos</option>';
    
    datosGlobales.filter(j => j.is_main).forEach(j => {
        select.innerHTML += `<option value="${j.nombre}">${j.nombre}</option>`;
    });
    if (actual !== "TODOS") select.value = actual;
}