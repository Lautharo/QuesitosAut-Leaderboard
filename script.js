const API_URL = "https://quesitos-backend.onrender.com"; 

let datosGlobales = [];
let modoActual = 'soloq';
let miGrafica = null;
let LOL_VER = "16.8.1"; 
let runesData = []; // Variable global para guardar el mapa de runas

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

    renderizarTabla();
    actualizarGrafica();
}

function renderizarTabla() {
    const tbody = document.getElementById('lista-jugadores-body');
    tbody.innerHTML = '';
    if (datosGlobales.length === 0) return;

    datosGlobales.sort((a, b) => b[modoActual].puntos_grafica - a[modoActual].puntos_grafica);

    datosGlobales.forEach((j, i) => {
        const stats = j[modoActual];
        const isAram = modoActual === 'aram';
        const color = getComputedStyle(document.documentElement).getPropertyValue(`--color-${stats.tier.toLowerCase()}`).trim() || '#8c52ff';
        const icon = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${stats.tier.toLowerCase()}.png`;

        const partidasTotales = isAram ? stats.total_partidas : (stats.wins + stats.losses);
        const textoPJs = isAram ? `<b style="color:white;">${partidasTotales}</b> <span style="font-size:0.8em">PJs (Season)</span>` : `<b style="color:white;">${partidasTotales}</b> <span style="font-size:0.8em">PJs</span>`;
        
        const rangoTexto = isAram ? (ARAM_TITLES[i] || "ARAM NOOB") : `${stats.tier} ${stats.rank}`;

        const rangoHTML = isAram ? 
            `<div class="lp-text-centered" style="color: var(--amarillo-pro); font-size: 1rem; position: relative;">${rangoTexto}</div>` : 
            `<div class="lp-progress-container"><div class="lp-progress-fill" style="width: ${Math.min(stats.lp, 100)}%; background-color: ${color}"></div><div class="lp-text-centered">${rangoTexto} - ${stats.lp} LP</div></div>`;
        
        const wrHTML = isAram ? 
            `<b>${stats.wr}%</b><br><small style="font-size:0.7em; color:var(--color-subtexto)">Últimos 5 PJs</small>` : 
            `<b>${stats.wr}%</b><br><small style="font-size:0.7em; color:var(--color-subtexto)">${stats.wins}W / ${stats.losses}L</small>`;

        const tr = document.createElement('tr');
        tr.className = 'fila-jugador';
        tr.onclick = () => mostrarScouter(j);
        tr.innerHTML = `
            <td style="color:var(--amarillo-pro); font-weight:800">${i + 1}</td>
            <td>
                <span style="color:white; font-weight:bold; font-size:1.1rem;">${j.nombre}</span> 
                <span style="color:gray; font-weight:normal; font-size:0.9rem;">#${j.tag}</span>
                <br>
                <small style="color:gray; font-size:0.7rem; text-transform:uppercase;">ÚLTIMA: ${j.last_game || '---'}</small>
            </td>
            <td style="color:gray;">${textoPJs}</td>
            <td>
                <div class="col-rango-completo">
                    <div class="contenedor-icono-fijo">${!isAram && stats.tier !== "UNRANKED" ? `<img src="${icon}" class="rank-icon">` : ''}</div>
                    <div class="rank-info-texto rank-${stats.tier}">
                        ${rangoHTML}
                    </div>
                </div>
            </td>
            <td style="text-align:right">${wrHTML}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- PLUGIN PERSONALIZADO PARA PINTAR LOS FONDOS DE LAS LIGAS ---
const fondoLigasPlugin = {
    id: 'fondoLigas',
    beforeDraw: (chart) => {
        const { ctx, chartArea: { top, bottom, left, right }, scales: { y } } = chart;
        
        // Definimos los rangos de ELO y sus colores (traslúcidos)
        const ligas = [
            { nombre: "C", min: 9000, color: "rgba(255, 215, 0, 0.05)" },    // Challenger
            { nombre: "GM", min: 8000, color: "rgba(255, 0, 0, 0.05)" },      // Grandmaster
            { nombre: "M", min: 7000, color: "rgba(128, 0, 128, 0.05)" },     // Master
            { nombre: "D", min: 6000, color: "rgba(87, 101, 242, 0.05)" },    // Diamond
            { nombre: "E", min: 5000, color: "rgba(42, 221, 156, 0.05)" },    // Emerald
            { nombre: "P", min: 4000, color: "rgba(75, 202, 235, 0.05)" },    // Platinum
            { nombre: "G", min: 3000, color: "rgba(242, 175, 66, 0.05)" },    // Gold
            { nombre: "S", min: 2000, color: "rgba(160, 160, 160, 0.05)" },   // Silver
            { nombre: "B", min: 1000, color: "rgba(205, 127, 50, 0.05)" },    // Bronze
            { nombre: "I", min: 0, color: "rgba(81, 72, 60, 0.05)" }          // Iron
        ];

        ctx.save();
        ligas.forEach((liga, i) => {
            // Calculamos dónde cae cada límite en el eje Y actual
            const yTop = y.getPixelForValue(ligas[i-1] ? ligas[i-1].min : 10000); 
            const yBottom = y.getPixelForValue(liga.min);

            // Si el rango es visible en el gráfico actual, lo pintamos
            if (yTop < bottom && yBottom > top) {
                // Pintar el fondo
                ctx.fillStyle = liga.color;
                ctx.fillRect(left, Math.max(top, yTop), right - left, Math.min(bottom, yBottom) - Math.max(top, yTop));
                
                // Pintar la línea separadora
                ctx.beginPath();
                ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; // Línea blanca suave
                ctx.setLineDash([5, 5]); // Línea punteada
                ctx.moveTo(left, yBottom);
                ctx.lineTo(right, yBottom);
                ctx.stroke();

                // Escribir el texto de la liga a la izquierda
                ctx.fillStyle = liga.color.replace('0.05', '0.5'); // Texto un poco más visible
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
    
    // Filtramos a los que sí tengan historial
    const jugadoresConHistorial = datosGlobales.filter(j => 
        j.historiales && j.historiales[modoActual] && j.historiales[modoActual].length > 0
    );

    if (jugadoresConHistorial.length === 0) return;

    // Tomamos las fechas del que más partidas tenga para el eje X
    const jugadorMasLargo = jugadoresConHistorial.reduce((max, j) => 
        j.historiales[modoActual].length > max.historiales[modoActual].length ? j : max
    );
    const labels = jugadorMasLargo.historiales[modoActual].map(h => h.fecha);

    // 1. ACHICAR LOS CÍRCULOS
    const datasets = jugadoresConHistorial.map(j => {
        const colorJugador = COLORES_JUGADORES[j.nombre] || '#ffffff';
        return {
            label: j.nombre,
            data: j.historiales[modoActual].map(h => h.puntos),
            borderColor: colorJugador,
            backgroundColor: colorJugador,
            borderWidth: 2,       
            pointRadius: 2,       
            pointHoverRadius: 5,  
            tension: 0.1
        };
    });

    miGrafica = new Chart(ctx, { 
        type: 'line', 
        data: { labels, datasets }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            
            // Margen interno al canvas para que nada se corte arriba
            layout: {
                padding: {
                    top: 15,
                    right: 20
                }
            },

            interaction: {
                mode: 'nearest', 
                intersect: true, 
            },
            
            scales: {
                y: {
                    suggestedMin: 1000, 
                    suggestedMax: 6000,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    // NUEVO: Reemplazamos los números por las iniciales
                    ticks: {
                        color: '#9ca3af',
                        font: { weight: 'bold', size: 12 },
                        callback: function(value) {
                            const rangos = {
                                0: 'I', 1000: 'B', 2000: 'S', 3000: 'G', 
                                4000: 'P', 5000: 'E', 6000: 'D', 7000: 'M', 
                                8000: 'GM', 9000: 'C'
                            };
                            return rangos[value] || ''; // Muestra la letra, o nada si está en medio
                        }
                    }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            },

            plugins: { 
                legend: { 
                    position: 'top',
                    labels: { 
                        color: '#9ca3af', 
                        usePointStyle: true, 
                        boxWidth: 6,   
                        boxHeight: 6,  
                        padding: 15,
                        font: { size: 11 }
                    } 
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const jugador = context.dataset.label;
                            const rangoFormateado = decodificarPuntos(context.parsed.y);
                            return `${jugador}: ${rangoFormateado}`;
                        }
                    }
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'xy',
                        threshold: 10 
                    },
                    zoom: {
                        wheel: { enabled: true }, 
                        drag: false, 
                        pinch: { enabled: true }, 
                        mode: 'xy', 
                    }
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
                        lpHtml = `<br><span class="${lpClass}">${lpSign}${p.lp_change} LP</span>`;
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

function iniciarLeaderboard() {
    document.getElementById('update-time').textContent = "DESPERTANDO SERVIDOR..."; 
    
    fetch(`${API_URL}/api/leaderboard`)
        .then(res => res.json())
        .then(d => { 
            datosGlobales = d; 
            document.getElementById('update-time').textContent = "LEADERBOARD ONLINE"; 
            cerrarAviso(); 
            cambiarModo('soloq'); 
        })
        .catch(() => {
            document.getElementById('update-time').textContent = "SIN DATOS - ESPERA A RENDER";
        });
}