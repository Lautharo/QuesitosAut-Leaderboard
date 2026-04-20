const API_URL = "https://quesitos-backend.onrender.com"; 

let datosGlobales = [];
let modoActual = 'soloq';
let miGrafica = null;
let LOL_VER = "14.8.1"; 

const ARAM_TITLES = [
    "ARAM GOD", "ARAM KING", "ARAM PRINCE", "ARAM DUKE", 
    "ARAM KNIGHT", "ARAM SQUIRE", "ARAM PEASANT", "ARAM MINION"
];

// --- MAPA DE HECHIZOS ---
const SUMMONER_MAP = {
    4: "SummonerFlash", 14: "SummonerDot", 11: "SummonerSmite", 
    12: "SummonerTeleport", 7: "SummonerHeal", 3: "SummonerExhaust", 
    21: "SummonerBarrier", 6: "SummonerHaste", 32: "SummonerSnowball", 1: "SummonerBoost"
};

// --- MAPA DE RUNAS ---
const RUNES_MAP = {
    8005: 'Precision/PressTheAttack/PressTheAttack', 8008: 'Precision/LethalTempo/LethalTempoTemp',
    8021: 'Precision/FleetFootwork/FleetFootwork', 8010: 'Precision/Conqueror/Conqueror',
    8112: 'Domination/Electrocute/Electrocute', 8124: 'Domination/Predator/Predator',
    8128: 'Domination/DarkHarvest/DarkHarvest', 9923: 'Domination/HailOfBlades/HailOfBlades',
    8214: 'Sorcery/SummonAery/SummonAery', 8229: 'Sorcery/ArcaneComet/ArcaneComet',
    8230: 'Sorcery/PhaseRush/PhaseRush', 8351: 'Inspiration/GlacialAugment/GlacialAugment',
    8360: 'Inspiration/UnsealedSpellbook/UnsealedSpellbook', 8369: 'Inspiration/FirstStrike/FirstStrike',
    8437: 'Resolve/GraspOfTheUndying/GraspOfTheUndying', 8439: 'Resolve/VeteranAftershock/VeteranAftershock',
    8465: 'Resolve/Guardian/Guardian',
    8000: '7201_Precision', 8100: '7200_Domination', 8200: '7202_Sorcery', 8300: '7203_Whimsy', 8400: '7204_Resolve'
};

const getSummonerIcon = (val) => {
    if (!val) return 'SummonerFlash';
    if (!isNaN(val)) return SUMMONER_MAP[val] || 'SummonerFlash';
    return String(val).replace('Ignite', 'Dot');
};

const getRuneIcon = (id) => {
    if (!id) return '';
    let path = RUNES_MAP[id];
    if (path) return `https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/${path}.png`;
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/7200_domination.png`; // Fallback
};

function cerrarAviso() {
    document.getElementById('overlay-mantenimiento').style.display = 'none';
}

function cambiarModo(modo) {
    modoActual = modo;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${modo}`).classList.add('active');
    
    const avisoAram = document.getElementById('aram-aviso');
    if (avisoAram) avisoAram.style.display = (modo === 'aram') ? 'block' : 'none';

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
        const textoPJs = isAram ? `<b style="color:white;">${partidasTotales || 0}</b> <span style="font-size:0.8em">PJs (Season)</span>` : `<b style="color:white;">${partidasTotales}</b> <span style="font-size:0.8em">PJs</span>`;
        
        const rangoTexto = isAram ? (ARAM_TITLES[i] || "ARAM NOOB") : `${stats.tier} ${stats.rank}`;

        const rangoHTML = isAram ? 
            `<div class="lp-text-centered" style="color: var(--amarillo-pro); font-size: 1rem; position: relative;">${rangoTexto}</div>` : 
            `<div class="lp-progress-container"><div class="lp-progress-fill" style="width: ${Math.min(stats.lp, 100)}%; background-color: ${color}"></div><div class="lp-text-centered">${rangoTexto} - ${stats.lp} LP</div></div>`;
        
        const wrHTML = isAram ? 
            `<b>${stats.wr || 0}%</b><br><small style="font-size:0.7em; color:var(--color-subtexto)">Últimos 5 PJs</small>` : 
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

function actualizarGrafica() {
    const ctx = document.getElementById('graficoElo').getContext('2d');
    if (miGrafica) miGrafica.destroy();
    if (datosGlobales.length === 0 || !datosGlobales[0].historiales) return;

    const labels = datosGlobales[0].historiales[modoActual].map(h => h.fecha);
    const datasets = datosGlobales.slice(0, 5).map(j => ({
        label: j.nombre,
        data: j.historiales[modoActual].map(h => h.puntos),
        borderColor: getComputedStyle(document.documentElement).getPropertyValue(`--color-${j[modoActual].tier.toLowerCase()}`).trim() || '#d4b55c',
        tension: 0.3
    }));

    miGrafica = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9ca3af' } } } } });
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
            // ESCUDO ANTICRASH: Si el servidor falla y no manda lista, mostramos el error sin romper la web
            if (!Array.isArray(partidas)) {
                console.error("Error del backend:", partidas);
                lista.innerHTML = `<div style="color:#f25757; text-align:center; padding: 20px;">Error obteniendo partidas: ${partidas.error || 'Datos no disponibles. Asegurate que tu app.py en Render esté actualizado.'}</div>`;
                document.getElementById('scouter-nombre').textContent = `SCOUTER: ${j.nombre}`;
                return;
            }

            document.getElementById('scouter-nombre').textContent = `SCOUTER: ${j.nombre}`;
            lista.innerHTML = ''; 

            if (partidas.length === 0) {
                lista.innerHTML = '<div style="color:var(--color-subtexto); text-align:center; padding: 20px;">No hay partidas recientes en esta cola.</div>';
                return;
            }

            partidas.forEach(p => {
                const card = document.createElement('div');
                card.className = `match-card ${p.win ? 'win' : 'loss'}`;
                
                const renderTeam = (team) => team.map(pl => `
                    <div class="player-row ${pl.name === j.nombre ? 'me' : ''}">
                        <img src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/champion/${pl.champ}.png" onerror="this.src='https://ui-avatars.com/api/?name=${pl.champ}&background=1c1f26&color=d4b55c&size=32&font-size=0.6'">
                        <b>${pl.name}</b>
                    </div>`).join('');

                const renderItems = p.items.map(id => {
                    if (id > 0) {
                        return `<div class="m-item-box"><img src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/item/${id}.png" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/13.24.1/img/item/${id}.png'"></div>`;
                    }
                    return `<div class="m-item-box"></div>`;
                }).join('');

                // MAPEO EXACTO DE POSICIONES (Arreglo icono Mid)
                const roleMapping = { 'middle': 'mid', 'jungle': 'jungle', 'bottom': 'bottom', 'utility': 'support', 'top': 'top' };
                const pos = p.role ? roleMapping[p.role.toLowerCase()] || 'none' : 'none';
                const posIcon = pos !== 'none' && !isAram ? `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-positions/position-icon-${pos}.png` : '';

                // Obtención segura de Runas (por si Python no las envía, no crashea)
                const rune1 = p.runas && p.runas.length > 0 ? getRuneIcon(p.runas[0]) : '';
                const rune2 = p.runas && p.runas.length > 1 ? getRuneIcon(p.runas[1]) : '';

                const sum1 = p.summoners ? getSummonerIcon(p.summoners[0]) : 'SummonerFlash';
                const sum2 = p.summoners ? getSummonerIcon(p.summoners[1]) : 'SummonerDot';

                card.innerHTML = `
                    <div class="m-info">
                        <b style="color:${p.win ? '#2add9c' : '#f25757'}">${p.win ? 'Victoria' : 'Derrota'}</b>
                        <span style="color: var(--amarillo-pro); font-weight: bold; font-size: 0.75rem;">${p.queue_name || (isAram ? 'ARAM' : 'Clasificatoria')}</span><br>
                        ${p.fecha} • ${p.duracion}
                        ${!isAram ? `<br><span class="${p.win ? 'lp-gain' : 'lp-loss'}">${p.win ? '+' : '-'}${p.lp_change || 20} LP</span>` : ''}
                    </div>
                    <div class="m-champ-block">
                        <div class="m-champ-img-container">
                            <img class="main-champ" src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/champion/${p.champ}.png" onerror="this.src='https://ui-avatars.com/api/?name=${p.champ}&background=1c1f26&color=d4b55c&size=64&font-size=0.6'">
                            <span class="m-lvl">${p.lvl}</span>
                            ${posIcon ? `<img src="${posIcon}" class="role-icon">` : ''}
                        </div>
                        <div class="m-spells-runes">
                            <img class="m-spell" src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/spell/${sum1}.png">
                            <img class="m-spell" src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/spell/${sum2}.png">
                        </div>
                        <div class="m-spells-runes" style="margin-left: 4px;">
                             ${rune1 ? `<img class="m-rune" src="${rune1}">` : '<div class="m-rune" style="border:1px solid #333;"></div>'}
                             ${rune2 ? `<img class="m-rune" src="${rune2}" style="width:16px; height:16px; margin: 0 auto; background:none;">` : '<div class="m-rune" style="width:16px; height:16px; border:1px solid #333; margin:0 auto;"></div>'}
                        </div>
                    </div>
                    <div class="m-stats">
                        <div class="m-kda">${p.k} / <span style="color:#f25757">${p.d}</span> / ${p.a}</div>
                        <div class="m-cs">${p.cs} CS</div>
                    </div>
                    <div class="m-items">${renderItems}</div>
                    <div class="m-teams">
                        <div class="team-col">${renderTeam(p.team1)}</div>
                        <div class="team-col">${renderTeam(p.team2)}</div>
                    </div>
                `;
                lista.appendChild(card);
            });
            document.getElementById('seccion-scouter').scrollIntoView({ behavior: 'smooth' });
        })
        .catch(err => {
            lista.innerHTML = '<div style="color:#f25757; text-align:center; padding: 20px;">Fallo de conexión. El servidor de Render debe estar apagado o cargando.</div>';
        });
}

document.getElementById('update-time').textContent = "SINCRONIZANDO PARCHE..."; 

fetch("https://ddragon.leagueoflegends.com/api/versions.json")
    .then(res => res.json())
    .then(versions => {
        LOL_VER = versions[0]; 
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