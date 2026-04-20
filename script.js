const API_URL = "https://quesitos-backend.onrender.com"; 

let datosGlobales = [];
let modoActual = 'soloq';
let miGrafica = null;
let LOL_VER = "16.8.1"; 
let runesData = []; // Variable global para guardar el mapa de runas

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

                const renderItems = p.items.map(id => {
                    const url = id > 0 ? `https://ddragon.leagueoflegends.com/cdn/${LOL_VER}/img/item/${id}.png` : '';
                    return `<div class="m-item-box">${url ? `<img src="${url}">` : ''}</div>`;
                }).join('');

                const roleMapping = { 'middle': 'mid', 'jungle': 'jung', 'bottom': 'bot', 'utility': 'support', 'top': 'top' };
                const pos = p.role ? roleMapping[p.role.toLowerCase()] || 'none' : 'none';
                const posIcon = pos !== 'none' && !isAram ? `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-positions/position-icon-${pos}.png` : '';

                const fixSum = (s) => String(s).replace('Ignite', 'Dot');

                // Generar los íconos de las runas
                const primaryRuneIcon = getRuneIcon(p.runes ? p.runes[0] : 0);
                const secondaryRuneIcon = getRuneIcon(p.runes ? p.runes[1] : 0);
                
                const r1Html = primaryRuneIcon ? `<img class="m-rune primary" src="${primaryRuneIcon}">` : `<div class="m-rune primary placeholder"></div>`;
                const r2Html = secondaryRuneIcon ? `<img class="m-rune secondary" src="${secondaryRuneIcon}">` : `<div class="m-rune secondary placeholder"></div>`;

                card.innerHTML = `
                    <div class="m-info">
                        <b style="color:${p.win ? '#2add9c' : '#f25757'}">${p.win ? 'Victoria' : 'Derrota'}</b>
                        <span style="color: var(--amarillo-pro); font-weight: bold; font-size: 0.75rem;">${p.queue_name}</span><br>
                        ${p.fecha} • ${p.duracion}
                        ${!isAram ? `<br><span class="${p.win ? 'lp-gain' : 'lp-loss'}">${p.win ? '+' : '-'}${p.lp_change || 20} LP</span>` : ''}
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
                    <div class="m-items">${renderItems}</div>
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