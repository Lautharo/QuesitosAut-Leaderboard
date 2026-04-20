// 1. ACÁ PONÉS EL LINK DE TU SERVIDOR EN RENDER (Sin la barra / al final)
const API_URL = "https://quesitos-backend.onrender.com"; 

let datosGlobales = [];
let modoActual = 'soloq';
let miGrafica = null;
const LOL_VER = "14.8.1"; 

function cerrarAviso() {
    document.getElementById('overlay-mantenimiento').style.display = 'none';
}

function cambiarModo(modo) {
    modoActual = modo;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${modo}`).classList.add('active');
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
        const color = getComputedStyle(document.documentElement).getPropertyValue(`--color-${stats.tier.toLowerCase()}`).trim() || '#8c52ff';
        const icon = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${stats.tier.toLowerCase()}.png`;

        const tr = document.createElement('tr');
        tr.className = 'fila-jugador';
        tr.onclick = () => mostrarScouter(j);
        tr.innerHTML = `
            <td style="color:var(--amarillo-pro); font-weight:800">${i + 1}</td>
            <td><b>${j.nombre}</b><br><small style="color:gray">${j.last_game || '---'}</small></td>
            <td>${stats.wins + stats.losses}</td>
            <td>
                <div class="col-rango-completo">
                    <div class="contenedor-icono-fijo">${stats.tier !== "UNRANKED" ? `<img src="${icon}" class="rank-icon">` : ''}</div>
                    <div class="rank-info-texto rank-${stats.tier}">
                        <div class="lp-progress-container">
                            <div class="lp-progress-fill" style="width: ${Math.min(stats.lp, 100)}%; background-color: ${color}"></div>
                            <div class="lp-text-centered">${modoActual === 'aram' ? 'ARAM KING' : stats.tier + ' ' + stats.rank} - ${stats.lp} LP</div>
                        </div>
                    </div>
                </div>
            </td>
            <td style="text-align:right"><b>${stats.wr}%</b></td>
        `;
        tbody.appendChild(tr);
    });
}

function actualizarGrafica() {
    const ctx = document.getElementById('graficoElo').getContext('2d');
    if (miGrafica) miGrafica.destroy();
    
    // Evita errores si el backend aún no manda el historial completo
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
    
    // 2. MOSTRAMOS ESTADO DE CARGA MIENTRAS RENDER BUSCA LAS PARTIDAS
    document.getElementById('scouter-nombre').textContent = `SCOUTER: ${j.nombre} (Buscando...)`;
    lista.innerHTML = '<div style="color:var(--amarillo-pro); text-align:center; padding: 20px;">Analizando historial en tiempo real...</div>';

    // 3. LE PEDIMOS A RENDER ÚNICAMENTE LAS PARTIDAS DE ESTE JUGADOR
    fetch(`${API_URL}/api/scouter/${j.puuid}/${modoActual}`)
        .then(res => res.json())
        .then(partidas => {
            document.getElementById('scouter-nombre').textContent = `SCOUTER: ${j.nombre}`;
            lista.innerHTML = ''; // Limpiamos el mensaje de carga

            partidas.forEach(p => {
                const card = document.createElement('div');
                card.className = `match-card ${p.win ? 'win' : 'loss'}`;
                const team1 = p.team1.map(pl => `<div class="player-row ${pl.name === j.nombre ? 'me' : ''}"><img src="https://ddragon.leagueoflegends.com/cdn/14.8.1/img/champion/${pl.champ}.png"><b>${pl.name}</b></div>`).join('');
                const team2 = p.team2.map(pl => `<div class="player-row ${pl.name === j.nombre ? 'me' : ''}"><img src="https://ddragon.leagueoflegends.com/cdn/14.8.1/img/champion/${pl.champ}.png"><b>${pl.name}</b></div>`).join('');

                card.innerHTML = `
                    <div style="font-size:0.8rem"><b>${p.win?'Victoria':'Derrota'}</b><br>${p.fecha}<br>${p.duracion}</div>
                    <div style="display:flex; align-items:center; gap:10px">
                        <img src="https://ddragon.leagueoflegends.com/cdn/14.8.1/img/champion/${p.champ}.png" width="50" style="border-radius:50%">
                        <div style="font-weight:800">${p.k}/${p.d}/${p.a}</div>
                    </div>
                    <div><small>${p.cs} CS</small></div>
                    <div style="display:grid; grid-template-columns: repeat(4, 25px); gap:2px">
                        ${p.items.map(id => id > 0 ? `<img src="https://ddragon.leagueoflegends.com/cdn/14.8.1/img/item/${id}.png" width="25">` : '<div style="width:25px; height:25px; background:#101218"></div>').join('')}
                    </div>
                    <div style="display:flex; gap:20px"><div>${team1}</div><div>${team2}</div></div>
                `;
                lista.appendChild(card);
            });
            document.getElementById('seccion-scouter').scrollIntoView({ behavior: 'smooth' });
        })
        .catch(err => {
            lista.innerHTML = '<div style="color:#f25757; text-align:center; padding: 20px;">Error al cargar las partidas. El servidor puede estar despertando.</div>';
        });
}

// 4. INICIO: CARGAMOS SOLO LA TABLA (MÁS RÁPIDO)
document.getElementById('update-time').textContent = "DESPERTANDO SERVIDOR..."; 

fetch(`${API_URL}/api/leaderboard`)
    .then(res => res.json())
    .then(d => { 
        datosGlobales = d; 
        document.getElementById('update-time').textContent = "LEADERBOARD ONLINE"; 
        cerrarAviso(); // Si carga bien, quitamos el cartel de peligro
        cambiarModo('soloq'); 
    })
    .catch(() => {
        document.getElementById('update-time').textContent = "SIN DATOS - ESPERA A RENDER";
    });