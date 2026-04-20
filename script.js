let datosGlobales = [];
let modoActual = 'soloq';
let miGrafica = null;
let LOL_VER = "14.8.1"; 

const ARAM_TITLES = [
    "ARAM GOD", "ARAM KING", "ARAM PRINCE", "ARAM DUKE", 
    "ARAM KNIGHT", "ARAM SQUIRE", "ARAM PEASANT", "ARAM MINION"
];

// --- MAPA DE RUNAS (Traduce los IDs de tu Python a imágenes oficiales) ---
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

const getRuneIcon = (id) => {
    if (!id) return '';
    let path = RUNES_MAP[id];
    if (path) return `https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/${path}.png`;
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/7200_domination.png`; // Runa genérica si falla
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
    
    document.getElementById('scouter-nombre').textContent = `SCOUTER: ${j.nombre}`;
    lista.innerHTML = ''; 

    // Al leer del datos.json local, extraemos las partidas al instante
    const partidas = j.partidas[modoActual] || [];

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

        // 1. TRADUCTOR DE POSICIÓN (SVG Vectoriales inquebrantables de Riot)
        const rawRole = p.role ? p.role.toLowerCase() : 'none';
        // Tu JSON manda: "middle", "bottom", "utility", "jungle", "top". Mapeamos al archivo SVG exacto:
        const roleMapping = { 'middle': 'middle', 'jungle': 'jungle', 'bottom': 'bottom', 'utility': 'utility', 'top': 'top' };
        const pos = roleMapping[rawRole] || 'none';
        
        // Solo carga el icono si la posición existe y NO es ARAM
        const posIcon = (pos !== 'none' && !isAram) ? `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/svg/position-${pos}.svg` : '';

        // 2. RUNAS Y HECHIZOS
        const fixSum = (s) => String(s).replace('Ignite', 'Dot');
        const sum1 = p.summoners && p.summoners[0] ? fixSum(p.summoners[0]) : 'SummonerFlash';
        const sum2 = p.summoners && p.summoners[1] ? fixSum(p.summoners[1]) : 'SummonerDot';

        const rune1 = p.runas && p.runas.length > 0 ? getRuneIcon(p.runas[0]) : '';
        const rune2 = p.runas && p.runas.length > 1 ? getRuneIcon(p.runas[1]) : '';

        const queueName = isAram ? 'ARAM' : (modoActual === 'soloq' ? 'Solo / Dúo' : 'Flex');

        card.innerHTML = `
            <div class="m-info">
                <b style="color:${p.win ? '#2add9c' : '#f25757'}">${p.win ? 'Victoria' : 'Derrota'}</b>
                <span style="color: var(--amarillo-pro); font-weight: bold; font-size: 0.75rem;">${queueName}</span><br>
                ${p.fecha} • ${p.duracion}
                ${!isAram ? `<br><span class="${p.win ? 'lp-gain' : 'lp-loss'}">${p.win ? '+' : '-'}${p.lp_change || 20} LP</span>` : ''}
            </div>
            <div class="m-champ-block">
                <div class="m-champ-img-container">
                    <img class="main-champ" src="https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/champion/${p.champ}.png" onerror="this.src='https://ui-avatars.com/api/?name=${p.champ}&background=1c1f26&color=d4b55c&size=64&font-size=0.6'">
                    <span class="m-lvl">${p.lvl}</span>
                    ${posIcon ? `<img src="${posIcon}" class="role-icon" style="background: rgba(28, 31, 38, 0.9); padding: 3px; border: 1px solid #2d3748; border-radius: 50%;">` : ''}
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
}

// --- ARRANQUE OPTIMIZADO: BUSCA LA VERSIÓN MÁS NUEVA DE RIOT Y LUEGO LEE DATOS.JSON ---
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
    document.getElementById('update-time').textContent = "CARGANDO DATOS..."; 
    
    // Leemos directo del archivo generado por tu main.py en GitHub
    fetch('datos.json')
        .then(res => res.json())
        .then(d => { 
            datosGlobales = d; 
            document.getElementById('update-time').textContent = "LEADERBOARD ONLINE"; 
            cerrarAviso(); 
            cambiarModo('soloq'); 
        })
        .catch(() => {
            document.getElementById('update-time').textContent = "SIN DATOS - ESPERA AL BOT";
        });
}