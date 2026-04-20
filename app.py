from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import os
import time
from datetime import datetime
import pytz
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from supabase import create_client, Client

app = Flask(__name__)
CORS(app) 

# Configuración de APIs y Base de Datos
API_KEY = os.environ.get("RIOT_API_KEY", "TU_CLAVE_AQUI")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

headers = {"X-Riot-Token": API_KEY}
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

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

db_lock = threading.Lock()

def log_error(mensaje):
    """Fuerza a Render a mostrar el error en consola al instante"""
    print(f"[ERROR CRÍTICO] {mensaje}", file=sys.stderr, flush=True)

def sync_lp_change(puuid, queue_type, current_lp, puntos_grafica, last_match_id):
    if not supabase: return 0
    try:
        with db_lock:
            # Ahora traemos los puntos totales, no solo los PL de 0 a 100
            res = supabase.table("match_history").select("puntos_grafica").eq("puuid", puuid).eq("queue_type", queue_type).order("created_at", desc=True).limit(1).execute()
            last_pts = res.data[0]['puntos_grafica'] if res.data else puntos_grafica
            
            diff = puntos_grafica - last_pts # Ej: 2218 (Plata III 18) - 2197 (Plata IV 97) = 21

            if diff != 0 or not res.data:
                supabase.table("match_history").upsert({
                    "puuid": puuid, "queue_type": queue_type,
                    "league_points": current_lp, "puntos_grafica": puntos_grafica, "change_lp": diff,
                    "match_id": last_match_id
                }, on_conflict="puuid,queue_type,match_id").execute()
            return diff
    except Exception as e:
        log_error(f"Supabase falló al sincronizar PL de {puuid}: {e}")
    return 0

def get_historial_db(puuid, queue_type):
    if not supabase: return []
    try:
        with db_lock: # <-- NUEVO: Hace que los hilos entren de a uno
            res = supabase.table("match_history").select("puntos_grafica", "created_at").eq("puuid", puuid).eq("queue_type", queue_type).order("created_at", desc=False).execute()
        
        historial = []
        for r in res.data:
            dt = datetime.fromisoformat(r['created_at'].replace('Z', '+00:00'))
            historial.append({
                "puntos": r['puntos_grafica'],
                "fecha": dt.astimezone(pytz.timezone('America/Argentina/Buenos_Aires')).strftime('%d/%m')
            })
        return historial
    except Exception as e:
        log_error(f"Error cargando historial de gráfica: {e}")
        return []

# --- FUNCIÓN MODIFICADA PARA EVITAR EL BAN DE RIOT ---
def procesar_jugador(jugador, arg_tz):
    name, tag = jugador['nombre'], jugador['tag']
    try:
        # NUEVO: Pausa de medio segundo por jugador para no saturar a Riot
        time.sleep(0.5) 
        
        url_acc = f"https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{name}/{tag}"
        res_acc = requests.get(url_acc, headers=headers)
        if res_acc.status_code != 200: return None
        puuid = res_acc.json()['puuid']

        # NUEVO: Validamos que Riot responda OK (200) antes de leer el JSON
        res_m = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?start=0&count=1", headers=headers)
        if res_m.status_code != 200: return None 
        m_ids = res_m.json()
        
        last_match_id = m_ids[0] if m_ids else ""
        last_date = "---"
        
        if m_ids:
            res_info = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/{m_ids[0]}", headers=headers)
            if res_info.status_code == 200:
                m_info = res_info.json()
                dt_utc = datetime.fromtimestamp(m_info['info']['gameEndTimestamp']/1000, tz=pytz.utc)
                last_date = dt_utc.astimezone(arg_tz).strftime('%d/%m %H:%M')

        res_league = requests.get(f"https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}", headers=headers)
        if res_league.status_code != 200: return None
        leagues = res_league.json()
        
        sq = next((q for q in leagues if q['queueType'] == 'RANKED_SOLO_5x5'), None)
        fl = next((q for q in leagues if q['queueType'] == 'RANKED_FLEX_SR'), None)

        d = {
            "nombre": name, "tag": tag, "puuid": puuid, "last_game": last_date,
            "is_main": jugador.get('is_main', True),
            "soloq": {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0, "wr": 0, "puntos_grafica": 0},
            "flex": {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0, "wr": 0, "puntos_grafica": 0},
            "aram": {"tier": "UNRANKED", "wins": 0, "losses": 0, "wr": 0, "total_partidas": 0, "puntos_grafica": 0},
            "historiales": { 
                "soloq": get_historial_db(puuid, "soloq"),
                "flex": get_historial_db(puuid, "flex")
            }
        }

        if sq:
            pts_sq = VALOR_TIER.get(sq['tier'], 0) + VALOR_RANK.get(sq['rank'], 0) + sq['leaguePoints']
            d["soloq"].update({"tier": sq['tier'], "rank": sq['rank'], "lp": sq['leaguePoints'], "wins": sq['wins'], "losses": sq['losses'], "wr": round((sq['wins']/(sq['wins']+sq['losses']))*100,1), "puntos_grafica": pts_sq})
            sync_lp_change(puuid, "soloq", sq['leaguePoints'], pts_sq, last_match_id)
        if fl:
            pts_fl = VALOR_TIER.get(fl['tier'], 0) + VALOR_RANK.get(fl['rank'], 0) + fl['leaguePoints']
            d["flex"].update({"tier": fl['tier'], "rank": fl['rank'], "lp": fl['leaguePoints'], "wins": fl['wins'], "losses": fl['losses'], "wr": round((fl['wins']/(fl['wins']+fl['losses']))*100,1), "puntos_grafica": pts_fl})
            sync_lp_change(puuid, "flex", fl['leaguePoints'], pts_fl, last_match_id)
        
        # Validación extra en ARAM
        res_aram = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=450&count=100", headers=headers)
        if res_aram.status_code == 200:
            aram_n = res_aram.json()
            total_aram = len(aram_n) if isinstance(aram_n, list) else 0
            d["aram"].update({"total_partidas": total_aram, "puntos_grafica": total_aram})

        return d
    except Exception as e:
        log_error(f"Error procesando a {name}: {e}")
        return None

@app.route('/')
def home():
    return "API de Quesitos Autistas funcionando (Con Supabase)"

@app.route('/api/leaderboard')
def get_leaderboard():
    if time.time() - cache_leaderboard["ultima_actualizacion"] < 300 and cache_leaderboard["datos"]:
        return jsonify({
            "jugadores": cache_leaderboard["datos"],
            "ultima_actualizacion": cache_leaderboard["ultima_actualizacion"]
        })

    # NUEVO: OBTENER JUGADORES DESDE SUPABASE
    try:
        res_jugadores = supabase.table("jugadores").select("*").execute()
        lista_jugadores = res_jugadores.data
    except Exception as e:
        log_error(f"Error cargando jugadores: {e}")
        lista_jugadores = []

    arg_tz = pytz.timezone('America/Argentina/Buenos_Aires')

    with ThreadPoolExecutor(max_workers=2) as executor:
        # Ahora recorremos la lista de la base de datos
        resultados = list(executor.map(lambda jug: procesar_jugador(jug, arg_tz), lista_jugadores))
    
    datos_finales = [res for res in resultados if res is not None]

    cache_leaderboard["datos"] = datos_finales
    cache_leaderboard["ultima_actualizacion"] = time.time()
    
    return jsonify({
        "jugadores": datos_finales,
        "ultima_actualizacion": cache_leaderboard["ultima_actualizacion"]
    })

@app.route('/api/jugadores', methods=['POST'])
def add_jugador():
    data = request.json
    nombre = data.get('nombre')
    tag = data.get('tag')
    is_main = data.get('is_main', True)
    
    if not nombre or not tag:
        return jsonify({"error": "Faltan datos"}), 400
        
    try:
        # 1. Validar que la cuenta exista en Riot Games antes de guardarla
        url_acc = f"https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{nombre}/{tag}"
        res_acc = requests.get(url_acc, headers=headers)
        if res_acc.status_code != 200:
            return jsonify({"error": "No se encontró el jugador en Riot. ¿Escribiste bien el Nombre y Tag?"}), 404
            
        # 2. Guardar en Supabase
        supabase.table("jugadores").insert({"nombre": nombre, "tag": tag, "is_main": is_main}).execute()
        
        # 3. Limpiar caché para que se actualice la página al instante
        cache_leaderboard["datos"] = []
        cache_leaderboard["ultima_actualizacion"] = 0
        
        return jsonify({"mensaje": "Jugador agregado con éxito"}), 200
    except Exception as e:
        log_error(f"Error agregando jugador: {e}")
        return jsonify({"error": "La cuenta ya existe o hubo un error en la base de datos."}), 500

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
            lp_current = 0 # <-- NUEVA VARIABLE
            if modo != 'aram' and supabase:
                try:
                    # Traemos también los league_points
                    db_res = supabase.table("match_history").select("change_lp, league_points").eq("match_id", mid).eq("puuid", puuid).execute()
                    if db_res.data:
                        lp_real = db_res.data[0]['change_lp']
                        lp_current = db_res.data[0]['league_points'] # <-- LO GUARDAMOS
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
                "lp_current": lp_current, # <-- LO AGREGAMOS AL JSON
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