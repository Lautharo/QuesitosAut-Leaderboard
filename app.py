from flask import Flask, jsonify
from flask_cors import CORS
import requests
import os
import time
from datetime import datetime
import pytz
from supabase import create_client, Client

app = Flask(__name__)
CORS(app) 

# Configuración de APIs y Base de Datos
API_KEY = os.environ.get("RIOT_API_KEY", "TU_CLAVE_AQUI")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

headers = {"X-Riot-Token": API_KEY}
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

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

SUMMONERS = {
    4: "SummonerFlash", 14: "SummonerDot", 11: "SummonerSmite", 
    12: "SummonerTeleport", 7: "SummonerHeal", 3: "SummonerExhaust", 
    21: "SummonerBarrier", 6: "SummonerHaste", 32: "SummonerSnowball", 
    1: "SummonerBoost"
}

cache_leaderboard = {"datos": [], "ultima_actualizacion": 0}

def sync_lp_change(puuid, queue_type, current_lp, last_match_id):
    """Calcula la diferencia de PL y la guarda en Supabase"""
    if not supabase: return 0
    try:
        res = supabase.table("match_history").select("league_points").eq("puuid", puuid).eq("queue_type", queue_type).order("created_at", desc=True).limit(1).execute()
        last_lp = res.data[0]['league_points'] if res.data else current_lp
        diff = current_lp - last_lp

        if diff != 0 or not res.data:
            supabase.table("match_history").upsert({
                "puuid": puuid, "queue_type": queue_type,
                "league_points": current_lp, "change_lp": diff,
                "match_id": last_match_id
            }, on_conflict="match_id").execute()
            return diff
    except Exception as e:
        print(f"Error sync LP: {e}")
    return 0

@app.route('/')
def home():
    return "API de Quesitos Autistas funcionando (Con Supabase)"

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
            last_match_id = m_ids[0] if m_ids else ""
            
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

            if sq:
                d["soloq"].update({"tier": sq['tier'], "rank": sq['rank'], "lp": sq['leaguePoints'], "wins": sq['wins'], "losses": sq['losses'], "wr": round((sq['wins']/(sq['wins']+sq['losses']))*100,1), "puntos_grafica": VALOR_TIER.get(sq['tier'], 0) + VALOR_RANK.get(sq['rank'], 0) + sq['leaguePoints']})
                sync_lp_change(puuid, "soloq", sq['leaguePoints'], last_match_id)
            if fl:
                d["flex"].update({"tier": fl['tier'], "rank": fl['rank'], "lp": fl['leaguePoints'], "wins": fl['wins'], "losses": fl['losses'], "wr": round((fl['wins']/(fl['wins']+fl['losses']))*100,1), "puntos_grafica": VALOR_TIER.get(fl['tier'], 0) + VALOR_RANK.get(fl['rank'], 0) + fl['leaguePoints']})
                sync_lp_change(puuid, "flex", fl['leaguePoints'], last_match_id)
            
            # (El código de ARAM sigue igual, lo abrevio acá para no hacerlo larguísimo, mantené el tuyo si preferís)
            aram_n = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=450&count=100", headers=headers).json()
            total_aram = len(aram_n) if isinstance(aram_n, list) else 0
            d["aram"].update({"total_partidas": total_aram, "puntos_grafica": total_aram})

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
        qid = QUEUES.get(modo, 420)
        # Obtenemos las últimas 10 partidas
        m_ids = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue={qid}&start=0&count=10", headers=headers).json()

        for mid in m_ids:
            time.sleep(0.05)
            m_data = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/{mid}", headers=headers).json()
            if 'info' not in m_data: continue
            
            info = m_data['info']
            me = next(p for p in info['participants'] if p['puuid'] == puuid)
            
            q_id = info.get('queueId', 0)
            q_name = "ARAM Normal" if modo == 'aram' else ("Solo / Dúo" if modo == 'soloq' else "Flex")

            # Buscamos el PL real en Supabase (solo para clasificatorias)
            lp_real = 0
            if modo != 'aram' and supabase:
                try:
                    db_res = supabase.table("match_history").select("change_lp").eq("match_id", mid).execute()
                    if db_res.data:
                        lp_real = db_res.data[0]['change_lp']
                except Exception: pass

            try:
                perks = me.get('perks', {}).get('styles', [])
                primary_rune = perks[0]['selections'][0]['perk'] if perks and 'selections' in perks[0] and perks[0]['selections'] else 0
                secondary_tree = perks[1]['style'] if len(perks) > 1 else 0
            except Exception: primary_rune, secondary_tree = 0, 0

            p_res = {
                "win": me['win'], "champ": me['championName'], "lvl": me['champLevel'],
                "k": me['kills'], "d": me['deaths'], "a": me['assists'],
                "cs": me['totalMinionsKilled'] + me['neutralMinionsKilled'],
                "items": [me.get(f'item{i}', 0) for i in range(7)],
                "role": me.get('individualPosition', 'ARAM'),
                "summoners": [SUMMONERS.get(me.get('summoner1Id'), "SummonerFlash"), SUMMONERS.get(me.get('summoner2Id'), "SummonerFlash")],
                "runes": [primary_rune, secondary_tree],
                "lp_change": lp_real,
                "duracion": f"{info['gameDuration'] // 60}:{info['gameDuration'] % 60:02d}",
                "fecha": datetime.fromtimestamp(info['gameEndTimestamp']/1000, tz=pytz.utc).astimezone(arg_tz).strftime('%d/%m %H:%M'),
                "queue_name": q_name,
                "team1": [{"name": p['riotIdGameName'], "champ": p['championName']} for p in info['participants'][:5]],
                "team2": [{"name": p['riotIdGameName'], "champ": p['championName']} for p in info['participants'][5:]]
            }
            partidas.append(p_res)
    except Exception as e: return jsonify({"error": str(e)}), 500
    
    return jsonify(partidas)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))