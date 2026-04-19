import requests
import json
import os
import time
from datetime import datetime

# 1. Tu API Key
API_KEY = os.environ.get("RIOT_API_KEY")
if not API_KEY:
    API_KEY = "RIOT_API_KEY"

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

# Mapa de hechizos de invocador para las imágenes
SUMMONERS = {
    4: "SummonerFlash", 12: "SummonerTeleport", 14: "SummonerIgnite",
    11: "SummonerSmite", 6: "SummonerHaste", 7: "SummonerHeal",
    21: "SummonerBarrier", 3: "SummonerExhaust", 32: "SummonerSnowball"
}

VALOR_TIER = {
    "CHALLENGER": 9000, "GRANDMASTER": 8000, "MASTER": 7000,
    "DIAMOND": 6000, "EMERALD": 5000, "PLATINUM": 4000,
    "GOLD": 3000, "SILVER": 2000, "BRONZE": 1000,
    "IRON": 0, "UNRANKED": -1000
}
VALOR_RANK = {"I": 400, "II": 300, "III": 200, "IV": 100, "": 0}

def obtener_todo():
    try:
        with open("datos.json", "r", encoding="utf-8") as f:
            viejos = json.load(f)
            historiales_map = {j['nombre']: j.get('historiales', {"soloq": [], "flex": [], "aram": []}) for j in viejos}
    except:
        historiales_map = {}

    datos_finales = []
    fecha_hoy = datetime.now().strftime("%d/%m")

    for jugador in JUGADORES:
        name, tag = jugador['nombre'], jugador['tag']
        print(f"Scouteando a {name}...")
        try:
            url_acc = f"https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{name}/{tag}"
            puuid = requests.get(url_acc, headers=headers).json()['puuid']

            leagues = requests.get(f"https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}", headers=headers).json()
            sq = next((q for q in leagues if q['queueType'] == 'RANKED_SOLO_5x5'), None)
            fl = next((q for q in leagues if q['queueType'] == 'RANKED_FLEX_SR'), None)

            d = {
                "nombre": name, "tag": tag, "last_game": "---",
                "historiales": historiales_map.get(name, {"soloq": [], "flex": [], "aram": []}),
                "soloq": {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0, "wr": 0, "puntos_grafica": 0},
                "flex": {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0, "wr": 0, "puntos_grafica": 0},
                "aram": {"tier": "UNRANKED", "wins": 0, "losses": 0, "wr": 0, "puntos_grafica": 0},
                "partidas": {"soloq": [], "flex": [], "aram": []}
            }

            if sq: d["soloq"].update({"tier": sq['tier'], "rank": sq['rank'], "lp": sq['leaguePoints'], "wins": sq['wins'], "losses": sq['losses'], "wr": round((sq['wins']/(sq['wins']+sq['losses']))*100,1), "puntos_grafica": VALOR_TIER.get(sq['tier'], 0) + VALOR_RANK.get(sq['rank'], 0) + sq['leaguePoints']})
            if fl: d["flex"].update({"tier": fl['tier'], "rank": fl['rank'], "lp": fl['leaguePoints'], "wins": fl['wins'], "losses": fl['losses'], "wr": round((fl['wins']/(fl['wins']+fl['losses']))*100,1), "puntos_grafica": VALOR_TIER.get(fl['tier'], 0) + VALOR_RANK.get(fl['rank'], 0) + fl['leaguePoints']})

            for modo, qid in QUEUES.items():
                m_ids = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue={qid}&start=0&count=10", headers=headers).json()
                for mid in m_ids:
                    time.sleep(1.2)
                    m_data = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/{mid}", headers=headers).json()
                    info = m_data['info']
                    me = next(p for p in info['participants'] if p['puuid'] == puuid)
                    
                    p_res = {
                        "win": me['win'], "champ": me['championName'], "lvl": me['champLevel'],
                        "k": me['kills'], "d": me['deaths'], "a": me['assists'],
                        "cs": me['totalMinionsKilled'] + me['neutralMinionsKilled'],
                        "items": [me[f'item{i}'] for i in range(7)],
                        "role": me['individualPosition'],
                        "summoners": [SUMMONERS.get(me['summoner1Id'], "SummonerFlash"), SUMMONERS.get(me['summoner2Id'], "SummonerIgnite")],
                        "runas": [me['perks']['styles'][0]['selections'][0]['perk'], me['perks']['styles'][1]['style']],
                        "lp_change": 22 if me['win'] else 19, # Simulación de PL
                        "duracion": f"{info['gameDuration'] // 60}:{info['gameDuration'] % 60:02d}",
                        "fecha": datetime.fromtimestamp(info['gameEndTimestamp']/1000).strftime('%d/%m'),
                        "team1": [], "team2": []
                    }
                    for p in info['participants']:
                        p_info = {"name": p['riotIdGameName'], "champ": p['championName']}
                        if p['teamId'] == 100: p_res["team1"].append(p_info)
                        else: p_res["team2"].append(p_info)
                    
                    d["partidas"][modo].append(p_res)
                    if d["last_game"] == "---": d["last_game"] = p_res["fecha"]

            datos_finales.append(d)
        except Exception as e: print(f"Error: {e}")

    with open("datos.json", "w", encoding="utf-8") as f:
        json.dump(datos_finales, f, indent=4, ensure_ascii=False)

obtener_todo()