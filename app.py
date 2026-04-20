from flask import Flask, jsonify
from flask_cors import CORS
import requests
import os
import time
import pytz
from datetime import datetime

app = Flask(__name__)
# Esto permite que tu frontend en GitHub se conecte a este backend en Railway
CORS(app) 

API_KEY = os.environ.get("RIOT_API_KEY", "TU_CLAVE_AQUI_POR_SI_ACASO")
headers = {"X-Riot-Token": API_KEY}

JUGADORES = [
    {"nombre": "AU l Thxgzz", "tag": "777"},
    {"nombre": "AU l Ferry", "tag": "2504"},
    {"nombre": "AU l benji", "tag": "777"},
    {"nombre": "AU l Osiris", "tag": "2007"},
    {"nombre": "Murs", "tag": "Kaiju"},
    {"nombre": "XCriadoenLobosX", "tag": "Toxic"},
    {"nombre": "Quesito Azul", "tag": "IDK"},
    {"nombre": "Quesito Gruyere", "tag": "Out"}
]

QUEUES = {"soloq": 420, "flex": 440, "aram": 450}
VALOR_TIER = {"CHALLENGER": 9000, "GRANDMASTER": 8000, "MASTER": 7000, "DIAMOND": 6000, "EMERALD": 5000, "PLATINUM": 4000, "GOLD": 3000, "SILVER": 2000, "BRONZE": 1000, "IRON": 0, "UNRANKED": -1000}
VALOR_RANK = {"I": 400, "II": 300, "III": 200, "IV": 100, "": 0}

# Memoria Caché para que la tabla principal cargue al instante
cache_leaderboard = {"datos": [], "ultima_actualizacion": 0}

@app.route('/')
def home():
    return "API de Quesitos Autistas funcionando al 100%"

@app.route('/api/leaderboard')
def get_leaderboard():
    if time.time() - cache_leaderboard["ultima_actualizacion"] < 300 and cache_leaderboard["datos"]:
        return jsonify(cache_leaderboard["datos"])

    datos_finales = []
    # Definimos la zona horaria de Argentina
    arg_tz = pytz.timezone('America/Argentina/Buenos_Aires')

    for jugador in JUGADORES:
        name, tag = jugador['nombre'], jugador['tag']
        try:
            url_acc = f"https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{name}/{tag}"
            res_acc = requests.get(url_acc, headers=headers)
            if res_acc.status_code != 200: continue
            puuid = res_acc.json()['puuid']

            # Obtenemos la última partida
            m_ids = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?start=0&count=1", headers=headers).json()
            last_date = "---"
            if m_ids:
                m_info = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/{m_ids[0]}", headers=headers).json()
                
                # --- LÓGICA DE HORA ARGENTINA ---
                timestamp = m_info['info']['gameEndTimestamp'] / 1000
                # Convertimos el tiempo a objeto datetime en UTC y luego a Argentina
                dt_utc = datetime.fromtimestamp(timestamp, tz=pytz.utc)
                dt_arg = dt_utc.astimezone(arg_tz)
                last_date = dt_arg.strftime('%d/%m %H:%M')
                # -------------------------------

            leagues = requests.get(f"https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}", headers=headers).json()
            sq = next((q for q in leagues if q['queueType'] == 'RANKED_SOLO_5x5'), None)
            fl = next((q for q in leagues if q['queueType'] == 'RANKED_FLEX_SR'), None)

            d = {
                "nombre": name, "tag": tag, "puuid": puuid, "last_game": last_date,
                "soloq": {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0, "wr": 0, "puntos_grafica": 0},
                "flex": {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0, "wr": 0, "puntos_grafica": 0},
                "aram": {"tier": "UNRANKED", "wins": 0, "losses": 0, "wr": 0, "puntos_grafica": 0}
            }

            if sq: d["soloq"].update({"tier": sq['tier'], "rank": sq['rank'], "lp": sq['leaguePoints'], "wins": sq['wins'], "losses": sq['losses'], "wr": round((sq['wins']/(sq['wins']+sq['losses']))*100,1), "puntos_grafica": VALOR_TIER.get(sq['tier'], 0) + VALOR_RANK.get(sq['rank'], 0) + sq['leaguePoints']})
            if fl: d["flex"].update({"tier": fl['tier'], "rank": fl['rank'], "lp": fl['leaguePoints'], "wins": fl['wins'], "losses": fl['losses'], "wr": round((fl['wins']/(fl['wins']+fl['losses']))*100,1), "puntos_grafica": VALOR_TIER.get(fl['tier'], 0) + VALOR_RANK.get(fl['rank'], 0) + fl['leaguePoints']})
            
            datos_finales.append(d)
        except Exception as e:
            print(f"Error con {name}: {e}")

    cache_leaderboard["datos"] = datos_finales
    cache_leaderboard["ultima_actualizacion"] = time.time()
    return jsonify(datos_finales)

@app.route('/api/scouter/<puuid>/<modo>')
def get_scouter(puuid, modo):
    # ¡ESTA ES LA MAGIA! Solo pide partidas cuando le das clic a alguien
    # Hace 11 peticiones a Riot: 1 para IDs y 10 para las partidas
    qid = QUEUES.get(modo, 420)
    partidas = []
    
    try:
        m_ids = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue={qid}&start=0&count=10", headers=headers).json()
        
        for mid in m_ids:
            m_data = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/{mid}", headers=headers).json()
            info = m_data['info']
            me = next(p for p in info['participants'] if p['puuid'] == puuid)
            
            p_res = {
                "win": me['win'], "champ": me['championName'], "lvl": me['champLevel'],
                "k": me['kills'], "d": me['deaths'], "a": me['assists'],
                "cs": me['totalMinionsKilled'] + me['neutralMinionsKilled'],
                "items": [me[f'item{i}'] for i in range(7)],
                "role": me.get('individualPosition', 'ARAM'),
                "summoners": [me['summoner1Id'], me['summoner2Id']],
                "duracion": f"{info['gameDuration'] // 60}:{info['gameDuration'] % 60:02d}",
                "fecha": datetime.fromtimestamp(info['gameEndTimestamp']/1000).strftime('%d/%m'),
                "team1": [{"name": p['riotIdGameName'], "champ": p['championName']} for p in info['participants'][:5]],
                "team2": [{"name": p['riotIdGameName'], "champ": p['championName']} for p in info['participants'][5:]]
            }
            partidas.append(p_res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify(partidas)

if __name__ == '__main__':
    # Puerto necesario para que Railway lo lea
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)