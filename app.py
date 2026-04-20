from flask import Flask, jsonify
from flask_cors import CORS
import requests
import os
import time
from datetime import datetime
import pytz

app = Flask(__name__)
CORS(app) 

API_KEY = os.environ.get("RIOT_API_KEY", "TU_CLAVE_AQUI")
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

# Nombres exactos de DataDragon para que no se rompan las imágenes
SUMMONERS = {
    4: "SummonerFlash", 14: "SummonerDot", 11: "SummonerSmite", 
    12: "SummonerTeleport", 7: "SummonerHeal", 3: "SummonerExhaust", 
    21: "SummonerBarrier", 6: "SummonerHaste", 32: "SummonerSnowball", 
    1: "SummonerBoost"
}

cache_leaderboard = {"datos": [], "ultima_actualizacion": 0}

@app.route('/')
def home():
    return "API de Quesitos Autistas funcionando al 100%"

@app.route('/api/leaderboard')
def get_leaderboard():
    if time.time() - cache_leaderboard["ultima_actualizacion"] < 300 and cache_leaderboard["datos"]:
        return jsonify(cache_leaderboard["datos"])

    datos_finales = []
    arg_tz = pytz.timezone('America/Argentina/Buenos_Aires')

    for jugador in JUGADORES:
        name, tag = jugador['nombre'], jugador['tag']
        try:
            url_acc = f"https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{name}/{tag}"
            res_acc = requests.get(url_acc, headers=headers)
            if res_acc.status_code != 200: continue
            puuid = res_acc.json()['puuid']

            m_ids = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?start=0&count=1", headers=headers).json()
            last_date = "---"
            if m_ids:
                m_info = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/{m_ids[0]}", headers=headers).json()
                dt_utc = datetime.fromtimestamp(m_info['info']['gameEndTimestamp']/1000, tz=pytz.utc)
                last_date = dt_utc.astimezone(arg_tz).strftime('%d/%m %H:%M')

            leagues = requests.get(f"https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}", headers=headers).json()
            sq = next((q for q in leagues if q['queueType'] == 'RANKED_SOLO_5x5'), None)
            fl = next((q for q in leagues if q['queueType'] == 'RANKED_FLEX_SR'), None)

            d = {
                "nombre": name, "tag": tag, "puuid": puuid, "last_game": last_date,
                "soloq": {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0, "wr": 0, "puntos_grafica": 0},
                "flex": {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0, "wr": 0, "puntos_grafica": 0},
                "aram": {"tier": "UNRANKED", "wins": 0, "losses": 0, "wr": 0, "total_partidas": 0, "puntos_grafica": 0}
            }

            if sq: d["soloq"].update({"tier": sq['tier'], "rank": sq['rank'], "lp": sq['leaguePoints'], "wins": sq['wins'], "losses": sq['losses'], "wr": round((sq['wins']/(sq['wins']+sq['losses']))*100,1), "puntos_grafica": VALOR_TIER.get(sq['tier'], 0) + VALOR_RANK.get(sq['rank'], 0) + sq['leaguePoints']})
            if fl: d["flex"].update({"tier": fl['tier'], "rank": fl['rank'], "lp": fl['leaguePoints'], "wins": fl['wins'], "losses": fl['losses'], "wr": round((fl['wins']/(fl['wins']+fl['losses']))*100,1), "puntos_grafica": VALOR_TIER.get(fl['tier'], 0) + VALOR_RANK.get(fl['rank'], 0) + fl['leaguePoints']})
            
            # --- ARAM: Buscamos hasta 100 de cada una para tener un total real ---
            aram_n = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=450&count=100", headers=headers).json()
            aram_k = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=720&count=100", headers=headers).json()
            
            combined_aram = (aram_n if isinstance(aram_n, list) else []) + (aram_k if isinstance(aram_k, list) else [])
            total_aram = len(combined_aram)
            
            w_a, l_a = 0, 0
            for mid in combined_aram[:5]:
                time.sleep(0.05)
                res_m = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/{mid}", headers=headers)
                if res_m.status_code == 200:
                    me = next((p for p in res_m.json()['info']['participants'] if p['puuid'] == puuid), None)
                    if me:
                        if me['win']: w_a += 1
                        else: l_a += 1

            wr_a = round((w_a / (w_a + l_a)) * 100, 1) if (w_a + l_a) > 0 else 0
            d["aram"].update({"total_partidas": total_aram, "wr": wr_a, "puntos_grafica": total_aram})

            datos_finales.append(d)
        except Exception as e: print(f"Error con {name}: {e}")

    cache_leaderboard["datos"] = datos_finales
    cache_leaderboard["ultima_actualizacion"] = time.time()
    return jsonify(datos_finales)

@app.route('/api/scouter/<puuid>/<modo>')
def get_scouter(puuid, modo):
    partidas = []
    arg_tz = pytz.timezone('America/Argentina/Buenos_Aires')
    
    try:
        m_ids = []
        if modo == 'aram':
            # Buscamos 10 de Normal y 10 de KAOS para mezclarlas
            ids_n = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=450&count=10", headers=headers).json()
            ids_k = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=720&count=10", headers=headers).json()
            m_ids = (ids_n if isinstance(ids_n, list) else []) + (ids_k if isinstance(ids_k, list) else [])
        else:
            qid = QUEUES.get(modo, 420)
            res = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue={qid}&start=0&count=10", headers=headers)
            m_ids = res.json() if res.status_code == 200 else []

        # Descargamos los detalles de todas
        raw_matches = []
        for mid in m_ids:
            time.sleep(0.05)
            m_data = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/{mid}", headers=headers).json()
            if 'info' in m_data: raw_matches.append(m_data)

        # MAGIA: Ordenamos TODAS las partidas por fecha exacta (de más nueva a más vieja)
        raw_matches.sort(key=lambda x: x['info']['gameEndTimestamp'], reverse=True)

        # Nos quedamos solo con las 10 más recientes reales
        for m_data in raw_matches[:10]:
            info = m_data['info']
            me = next(p for p in info['participants'] if p['puuid'] == puuid)
            
            q_id = info.get('queueId', 0)
            q_name = "Clasificatoria"
            if modo == 'aram': q_name = "ARAM KAOS" if q_id == 720 else "ARAM Normal"
            elif modo == 'soloq': q_name = "Solo / Dúo"
            elif modo == 'flex': q_name = "Flex"

            dt_utc = datetime.fromtimestamp(info['gameEndTimestamp']/1000, tz=pytz.utc)
            
            # --- Extracción de Runas SEGURA ---
            try:
                perks = me.get('perks', {}).get('styles', [])
                primary_rune = perks[0]['selections'][0]['perk'] if perks and 'selections' in perks[0] and perks[0]['selections'] else 0
                secondary_tree = perks[1]['style'] if len(perks) > 1 else 0
            except Exception:
                primary_rune, secondary_tree = 0, 0
            
            p_res = {
                "win": me['win'], "champ": me['championName'], "lvl": me['champLevel'],
                "k": me['kills'], "d": me['deaths'], "a": me['assists'],
                "cs": me['totalMinionsKilled'] + me['neutralMinionsKilled'],
                "items": [me.get(f'item{i}', 0) for i in range(7)],
                "role": me.get('individualPosition', 'ARAM'),
                "summoners": [SUMMONERS.get(me.get('summoner1Id'), "SummonerFlash"), SUMMONERS.get(me.get('summoner2Id'), "SummonerFlash")],
                "runes": [primary_rune, secondary_tree],
                "duracion": f"{info['gameDuration'] // 60}:{info['gameDuration'] % 60:02d}",
                "fecha": dt_utc.astimezone(arg_tz).strftime('%d/%m %H:%M'),
                "queue_name": q_name,
                "lp_change": 0 if modo == 'aram' else (22 if me['win'] else 19),
                "team1": [{"name": p['riotIdGameName'], "champ": p['championName']} for p in info['participants'][:5]],
                "team2": [{"name": p['riotIdGameName'], "champ": p['championName']} for p in info['participants'][5:]]
            }
            partidas.append(p_res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify(partidas)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)