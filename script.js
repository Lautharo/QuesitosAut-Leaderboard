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
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${modo}`).classList.add('active');
    
    if (modo === 'aram') {
        document.getElementById('aram-aviso').style.display = 'block';
    } else {
        document.getElementById('aram-aviso').style.display = 'none';
    }

    // NUEVO: Oculta el Scouter y deselecciona al cambiar de pestaña
    jugadorSeleccionado = null;
    document.getElementById('seccion-scouter').style.display = 'none';

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
                        <small style="color:gray; font-size:0.7rem; text-transform:uppercase;">ÚLTIMA: ${j.last_game || '---'}</small>
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
    
    // 1. Auto-parchear a los jugadores nuevos o smurfs
    const hoy = new Date().toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit'});
    datosGlobales.forEach(j => {
        if (j.historiales && j.historiales[modoActual] && j.historiales[modoActual].length === 0 && j[modoActual].tier !== "UNRANKED") {
            j.historiales[modoActual].push({
                fecha: hoy,
                puntos: j[modoActual].puntos_grafica
            });
        }
    });

    // 2. Aplicar Filtros de Smurfs y Dueños
    const mostrarSmurfs = document.getElementById('filtro-smurf') ? document.getElementById('filtro-smurf').checked : true;
    const filtroJugador = document.getElementById('filtro-jugador') ? document.getElementById('filtro-jugador').value : 'TODOS';

    let jugadoresA_Mostrar = datosGlobales;
    if (!mostrarSmurfs) jugadoresA_Mostrar = jugadoresA_Mostrar.filter(j => j.is_main);
    if (filtroJugador !== 'TODOS') {
        jugadoresA_Mostrar = jugadoresA_Mostrar.filter(j => j.nombre === filtroJugador || j.propietario === filtroJugador);
    }

    const jugadoresConHistorial = jugadoresA_Mostrar.filter(j => j.historiales && j.historiales[modoActual] && j.historiales[modoActual].length > 0);
    if (jugadoresConHistorial.length === 0) return;

    // --- 3. EL FIX: ALINEACIÓN SECUENCIAL (A LA DERECHA) ---
    // Buscamos al jugador que más partidas jugó para saber cuántos puntos (ticks) va a tener el eje X
    const jugadorMasLargo = jugadoresConHistorial.reduce((max, j) => 
        j.historiales[modoActual].length > max.historiales[modoActual].length ? j : max
    );
    const labels = jugadorMasLargo.historiales[modoActual].map(h => h.fecha);
    const maxLength = labels.length;

    const datasets = jugadoresConHistorial.map(j => {
        const colorJugador = obtenerColor(j.nombre);
        const data = j.historiales[modoActual].map(h => h.puntos);

        // --- EL FIX ESTÁ ACÁ ---
        // Creamos los espacios vacíos para rellenar
        const padding = new Array(maxLength - data.length).fill(null);
        
        // Sumamos los datos PRIMERO y el espacio vacío AL FINAL (antes estaba al revés)
        const dataAlineada = data.concat(padding);

        return {
            label: j.nombre,
            data: dataAlineada,
            borderColor: colorJugador,
            backgroundColor: colorJugador,
            borderWidth: 2,       
            pointRadius: 3,       
            pointHoverRadius: 6,  
            tension: 0.1,
            spanGaps: true 
        };
    });

    miGrafica = new Chart(ctx, { 
        type: 'line', 
        data: { labels, datasets }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            layout: { padding: { top: 15, right: 20 } },
            interaction: { mode: 'nearest', intersect: false },
            scales: {
                y: {
                    suggestedMin: 1000, 
                    suggestedMax: 6000,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { display: false }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            },
            plugins: { 
                legend: { 
                    position: 'top',
                    labels: { color: '#9ca3af', usePointStyle: true, boxWidth: 6, boxHeight: 6, padding: 15, font: { size: 11 } } 
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${decodificarPuntos(context.parsed.y)}`;
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'xy', threshold: 10 },
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

function mostrarScouter(j) {
    document.getElementById('seccion-scouter').style.display = 'block';
    const lista = document.getElementById('lista-partidas');
    const isAram = modoActual === 'aram';
    
    document.getElementById('scouter-nombre').textContent = `SCOUTER: ${j.nombre} (Buscando...)`;
    lista.innerHTML = '<div style="color:var(--amarillo-pro); text-align:center; padding: 20px;">Analizando historial en tiempo real...</div>';

    fetch(`${API_URL}/api/scouter/${j.puuid}/${modoActual}`)
        .then(res => res.json())
        .then(partidas => {
            document.getElementById('scouter-nombre').textContent = `SCOUTER: ${j.nombre}`;
            lista.innerHTML = ''; 

            partidas.forEach(p => {
                const card = document.createElement('div');
                card.className = `match-card ${p.win ? 'win' : 'loss'}`;
                const team1 = p.team1.map(pl => `<div class="player-row ${pl.name === j.nombre ? 'me' : ''}"><img src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/champion/${pl.champ}.png" onerror="this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/-1.png'"><b>${pl.name}</b></div>`).join('');
                const team2 = p.team2.map(pl => `<div class="player-row ${pl.name === j.nombre ? 'me' : ''}"><img src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/champion/${pl.champ}.png" onerror="this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/-1.png'"><b>${pl.name}</b></div>`).join('');

                // --- 1. Separar los 6 ítems normales del Trinket (7mo ítem) ---
                const normalItems = p.items.slice(0, 6).map(id => {
                    const url = id > 0 ? `https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/item/${id}.png` : '';
                    return `<div class="m-item-box">${url ? `<img src="${url}">` : ''}</div>`;
                }).join('');

                const trinketId = p.items[6];
                const trinketUrl = trinketId > 0 ? `https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/item/${trinketId}.png` : '';
                const renderTrinket = `<div class="m-trinket-box">${trinketUrl ? `<img src="${trinketUrl}">` : ''}</div>`;

                // --- 2. Links oficiales de OP.GG para los roles ---
                const roleMapping = { 'middle': 'mid', 'jungle': 'jungle', 'bottom': 'adc', 'utility': 'support', 'top': 'top' };
                const pos = p.role ? roleMapping[p.role.toLowerCase()] || 'none' : 'none';
                const posIcon = pos !== 'none' && !isAram ? `https://s-lol-web.op.gg/images/icon/icon-position-${pos}.svg` : '';

                const fixSum = (s) => String(s).replace('Ignite', 'Dot');

                // Generar los íconos de las runas
                const primaryRuneIcon = getRuneIcon(p.runes ? p.runes[0] : 0);
                const secondaryRuneIcon = getRuneIcon(p.runes ? p.runes[1] : 0);
                
                const r1Html = primaryRuneIcon ? `<img class="m-rune primary" src="${primaryRuneIcon}">` : `<div class="m-rune primary placeholder"></div>`;
                const r2Html = secondaryRuneIcon ? `<img class="m-rune secondary" src="${secondaryRuneIcon}">` : `<div class="m-rune secondary placeholder"></div>`;

                // --- 3. Lógica para mostrar PL Reales o "Calibrando" ---
                let lpHtml = '';
                if (!isAram) {
                    if (p.lp_change === 0) {
                        lpHtml = `<br><span style="color: var(--color-subtexto); font-size: 0.8rem;">Calibrando PL...</span>`;
                    } else {
                        const lpSign = p.lp_change > 0 ? '+' : '';
                        const lpClass = p.lp_change > 0 ? 'lp-gain' : 'lp-loss';
                        
                        // Lógica para detectar el Ascenso/Descenso
                        let estadoExtra = "";
                        // Si gané PL, y mis PL actuales menos lo que gané da negativo, crucé de liga hacia arriba
                        if (p.lp_change > 0 && (p.lp_current - p.lp_change < 0)) {
                            estadoExtra = ' <span style="color:#d4b55c; font-size: 0.8em">(Ascenso)</span>';
                        } 
                        // Si perdí PL, y mis PL actuales menos lo que perdí da más de 100, caí de liga
                        else if (p.lp_change < 0 && (p.lp_current - p.lp_change >= 100)) {
                            estadoExtra = ' <span style="color:#9ca3af; font-size: 0.8em">(Descenso)</span>';
                        }

                        lpHtml = `<br><span class="${lpClass}">${lpSign}${p.lp_change} LP${estadoExtra}</span>`;
                    }
                }

                card.innerHTML = `
                    <div class="m-info">
                        <b style="color:${p.win ? '#2add9c' : '#f25757'}">${p.win ? 'Victoria' : 'Derrota'}</b>
                        <span style="color: var(--amarillo-pro); font-weight: bold; font-size: 0.75rem;">${p.queue_name}</span><br>
                        ${p.fecha} • ${p.duracion}
                        ${lpHtml}
                    </div>
                    <div class="m-champ-block">
                        <div class="m-champ-img-container">
                            <img class="main-champ" src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/champion/${p.champ}.png" onerror="this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/-1.png'">
                            <span class="m-lvl">${p.lvl}</span>
                            ${posIcon ? `<div class="role-icon-container"><img src="${posIcon}" class="role-icon"></div>` : ''}
                        </div>
                        <div class="m-spells-runes">
                            <div class="m-sr-col">
                                <img class="m-spell" src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/spell/${p.summoners ? fixSum(p.summoners[0]) : 'SummonerFlash'}.png">
                                <img class="m-spell" src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/spell/${p.summoners ? fixSum(p.summoners[1]) : 'SummonerDot'}.png">
                            </div>
                            <div class="m-sr-col">
                                ${r1Html}
                                ${r2Html}
                            </div>
                        </div>
                    </div>
                    <div class="m-stats">
                        <div class="m-kda">${p.k} / <span style="color:#f25757">${p.d}</span> / ${p.a}</div>
                        <div class="m-cs">${p.cs} CS</div>
                    </div>
                    <div class="m-items-container">
                        <div class="m-items">${normalItems}</div>
                        ${renderTrinket}
                    </div>
                    <div class="m-teams">
                        <div class="team-col">${team1}</div>
                        <div class="team-col">${team2}</div>
                    </div>
                `;
                lista.appendChild(card);
            });
            document.getElementById('seccion-scouter').scrollIntoView({ behavior: 'smooth' });
        })
        .catch(err => {
            lista.innerHTML = '<div style="color:#f25757; text-align:center; padding: 20px;">Error al cargar las partidas. El servidor puede estar despertando.</div>';
        });
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
    btn.textContent = "Actualizando...";
    
    // Llamamos de nuevo a la función base para que pida los datos y active la animación
    iniciarLeaderboard();
}

// --- FUNCIÓN MODIFICADA PARA LA PANTALLA DE CARGA ---
function iniciarLeaderboard() {
    document.getElementById('update-time').textContent = "DESPERTANDO SERVIDOR..."; 
    document.getElementById('pantalla-carga').style.display = 'flex'; // Prende la animación de carga
    document.getElementById('pantalla-carga').style.opacity = '1';
    
    fetch(`${API_URL}/api/leaderboard`)
        .then(res => res.json())
        .then(d => { 
            // OJO ACÁ: Ahora el backend devuelve un objeto con "jugadores" y "ultima_actualizacion"
            datosGlobales = d.jugadores; 
            
            document.getElementById('update-time').textContent = "LEADERBOARD ONLINE"; 
            cerrarAviso(); 
            
            // Apaga la pantalla de carga suavemente
            document.getElementById('pantalla-carga').style.opacity = '0'; 
            setTimeout(() => document.getElementById('pantalla-carga').style.display = 'none', 500);
            
            poblarFiltros();
            cambiarModo(modoActual); 
            
            // Le pasamos el tiempo exacto en el que el servidor se actualizó para arrancar el reloj
            iniciarCooldown(d.ultima_actualizacion); 
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