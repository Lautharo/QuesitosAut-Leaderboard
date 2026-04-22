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
riot_api_lock = threading.Lock() # <-- NUEVO: Candado para el bot y el botón

def log_error(mensaje):
    """Fuerza a Render a mostrar el error en consola al instante"""
    print(f"[ERROR CRÍTICO] {mensaje}", file=sys.stderr, flush=True)

def sync_lp_change(puuid, queue_type, current_lp, puntos_grafica, last_match_id):
    if not supabase: return 0
    try:
        with db_lock:
            res = supabase.table("match_history").select("puntos_grafica, match_id").eq("puuid", puuid).eq("queue_type", queue_type).order("created_at", desc=True).limit(1).execute()
            
            last_pts = res.data[0]['puntos_grafica'] if res.data else puntos_grafica
            diff = puntos_grafica - last_pts 

            # VOLVEMOS AL SISTEMA ORIGINAL: Solo guarda si la diferencia de puntos NO es 0 (o si es el primer registro de la cuenta)
            if diff != 0 or not res.data:
                m_id = last_match_id if last_match_id else f"manual_{int(time.time())}"
                supabase.table("match_history").upsert({
                    "puuid": puuid, "queue_type": queue_type,
                    "league_points": current_lp, "puntos_grafica": puntos_grafica, "change_lp": diff,
                    "match_id": m_id
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
    db_id = jugador.get('id')
    name_db, tag_db = jugador['nombre'], jugador['tag']
    puuid = jugador.get('puuid')
    profile_icon_id = jugador.get('profileIconId')
    
    # Si la cuenta es nueva y no tiene PUUID, lo buscamos rápido
    if not puuid:
        res_acc = requests.get(f"https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{name_db}/{tag_db}", headers=headers)
        if res_acc.status_code == 200:
            puuid = res_acc.json()['puuid']
            if supabase and db_id:
                supabase.table("jugadores").update({"puuid": puuid}).eq("id", db_id).execute()
        else:
            return None

    # FIX ICONOS: Usamos requests directo porque session se bugea en paralelo
    if not profile_icon_id or profile_icon_id == 29:
        res_summ = requests.get(f"https://la2.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/{puuid}", headers=headers)
        if res_summ.status_code == 200:
            profile_icon_id = res_summ.json().get('profileIconId', 29)
            if supabase and db_id:
                try:
                    supabase.table("jugadores").update({"profileIconId": profile_icon_id}).eq("id", db_id).execute()
                except Exception as e:
                    log_error(f"Error guardando foto DB para {name_db}: {e}")
        else:
            log_error(f"Error pidiendo foto a Riot para {name_db}: {res_summ.status_code}")
            profile_icon_id = 29
            
    try:
        # FIX CRÍTICO: Reemplazamos "session.get" por "requests.get" para que el servidor no explote
        res_league = requests.get(f"https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}", headers=headers)
        leagues = res_league.json() if res_league.status_code == 200 else []
        sq = next((q for q in leagues if q['queueType'] == 'RANKED_SOLO_5x5'), None)
        fl = next((q for q in leagues if q['queueType'] == 'RANKED_FLEX_SR'), None)

        res_sq = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=420&start=0&count=1", headers=headers)
        sq_id = res_sq.json()[0] if res_sq.status_code == 200 and res_sq.json() else ""

        res_fl = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=440&start=0&count=1", headers=headers)
        fl_id = res_fl.json()[0] if res_fl.status_code == 200 and res_fl.json() else ""

        # --- FIX 1: OBTENER LA FECHA EXACTA DE LA ÚLTIMA PARTIDA ---
        sq_date = "---"
        fl_date = "---"
        
        if sq_id:
            res_info = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/{sq_id}", headers=headers)
            if res_info.status_code == 200:
                end_ts = res_info.json()['info'].get('gameEndTimestamp', 0) / 1000
                if end_ts > 0:
                    dt_utc = datetime.fromtimestamp(end_ts, tz=pytz.utc)
                    sq_date = dt_utc.astimezone(arg_tz).strftime('%d/%m %H:%M')

        if fl_id:
            res_info = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/{fl_id}", headers=headers)
            if res_info.status_code == 200:
                end_ts = res_info.json()['info'].get('gameEndTimestamp', 0) / 1000
                if end_ts > 0:
                    dt_utc = datetime.fromtimestamp(end_ts, tz=pytz.utc)
                    fl_date = dt_utc.astimezone(arg_tz).strftime('%d/%m %H:%M')

        d = {
            "nombre": name_db, "tag": tag_db, "puuid": puuid,
            "profileIconId": profile_icon_id,
            "is_main": jugador.get('is_main', True),
            "propietario": jugador.get('propietario'),
            "soloq": {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0, "wr": 0, "puntos_grafica": 0, "last_game": sq_date},
            "flex": {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0, "wr": 0, "puntos_grafica": 0, "last_game": fl_date},
            "aram": {"tier": "UNRANKED", "wins": 0, "losses": 0, "wr": 0, "total_partidas": 0, "puntos_grafica": 0, "last_game": "---"},
            "historiales": { 
                "soloq": get_historial_db(puuid, "soloq"),
                "flex": get_historial_db(puuid, "flex")
            }
        }

        if sq:
            pts_sq = VALOR_TIER.get(sq['tier'], 0) + VALOR_RANK.get(sq['rank'], 0) + sq['leaguePoints']
            d["soloq"].update({"tier": sq['tier'], "rank": sq['rank'], "lp": sq['leaguePoints'], "wins": sq['wins'], "losses": sq['losses'], "wr": round((sq['wins']/(sq['wins']+sq['losses']))*100,1), "puntos_grafica": pts_sq})
            sync_lp_change(puuid, "soloq", sq['leaguePoints'], pts_sq, sq_id)
        if fl:
            pts_fl = VALOR_TIER.get(fl['tier'], 0) + VALOR_RANK.get(fl['rank'], 0) + fl['leaguePoints']
            d["flex"].update({"tier": fl['tier'], "rank": fl['rank'], "lp": fl['leaguePoints'], "wins": fl['wins'], "losses": fl['losses'], "wr": round((fl['wins']/(fl['wins']+fl['losses']))*100,1), "puntos_grafica": pts_fl})
            sync_lp_change(puuid, "flex", fl['leaguePoints'], pts_fl, fl_id)
        
        total_aram = 0
        for qid in [450, 1130]:
            res_aram = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue={qid}&startTime=1767225600&count=100", headers=headers)
            if res_aram.status_code == 200:
                total_aram += len(res_aram.json())
        d["aram"].update({"total_partidas": total_aram, "puntos_grafica": total_aram})

        return d
    except Exception as e:
        log_error(f"Error procesando a {name_db}: {e}")
        return None

@app.route('/')
def home():
    return "API de Quesitos Autistas funcionando (Con Supabase)"

@app.route('/api/leaderboard')
def get_leaderboard():
    # LA PUERTA RÁPIDA: Solo lee Supabase
    try:
        res = supabase.table("cache_leaderboard_db").select("*").eq("id", 1).execute()
        if res.data and res.data[0].get("datos"):
            return jsonify({
                "jugadores": res.data[0]["datos"],
                "ultima_actualizacion": res.data[0]["ultima_actualizacion"]
            })
    except Exception as e:
        log_error(f"Error leyendo cache rápida: {e}")
    
    return jsonify({"jugadores": [], "ultima_actualizacion": 0})

@app.route('/api/update')
def force_update():
    global cache_leaderboard
    
    # 1. ESCUDO ANTI-COLISIONES: Si alguien (bot o humano) ya está actualizando, rebotamos.
    if not riot_api_lock.acquire(blocking=False):
        log_error("Colisión evitada: El servidor ya estaba actualizando. Devolviendo caché.")
        return get_leaderboard()

    try:
        # 2. ESCUDO DE TIEMPO: Si se actualizó hace menos de 2 minutos, no molestamos a Riot
        ahora = time.time()
        if ahora - cache_leaderboard.get("ultima_actualizacion", 0) < 120:
            return get_leaderboard()

        # --- TRABAJO PESADO ---
        try:
            res_jugadores = supabase.table("jugadores").select("*").execute()
            lista_jugadores = res_jugadores.data
        except Exception as e:
            log_error(f"Error cargando jugadores: {e}")
            lista_jugadores = []

        arg_tz = pytz.timezone('America/Argentina/Buenos_Aires')

        with ThreadPoolExecutor(max_workers=2) as executor:
            resultados = list(executor.map(lambda jug: procesar_jugador(jug, arg_tz), lista_jugadores))
        
        datos_finales = [res for res in resultados if res is not None]
        ahora_fin = time.time()

        # Guarda la foto en Supabase para la puerta rápida
        try:
            supabase.table("cache_leaderboard_db").update({
                "datos": datos_finales,
                "ultima_actualizacion": ahora_fin
            }).eq("id", 1).execute()
        except Exception as e:
            log_error(f"Error guardando cache: {e}")
            
        cache_leaderboard["ultima_actualizacion"] = ahora_fin
        cache_leaderboard["datos"] = datos_finales
        
        return jsonify({
            "jugadores": datos_finales,
            "ultima_actualizacion": ahora_fin
        })
    finally:
        # 3. Soltamos la llave al terminar
        riot_api_lock.release()

@app.route('/api/jugadores', methods=['POST'])
def add_jugador():
    data = request.json
    nombre = data.get('nombre')
    tag = data.get('tag')
    is_main = data.get('is_main', True)
    propietario = data.get('propietario', None) 

    if not nombre or not tag:
        return jsonify({"error": "Faltan datos"}), 400

    try:
        url_acc = f"https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{nombre}/{tag}"
        res_acc = requests.get(url_acc, headers=headers)
        if res_acc.status_code != 200:
            return jsonify({"error": "No se encontró el jugador en Riot. ¿Escribiste bien el Nombre y Tag?"}), 404

        acc_data = res_acc.json()
        puuid_real = acc_data['puuid']
        nombre_real = acc_data.get('gameName', nombre)
        tag_real = acc_data.get('tagLine', tag)

        # NUEVO: Buscamos el icono de perfil antes de guardar al pibe nuevo
        profile_icon_id = 29
        res_summ = requests.get(f"https://la2.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/{puuid_real}", headers=headers)
        if res_summ.status_code == 200:
            profile_icon_id = res_summ.json().get('profileIconId', 29)

        # Guardamos todo en la base de datos
        supabase.table("jugadores").insert({
            "nombre": nombre_real, 
            "tag": tag_real, 
            "is_main": is_main, 
            "propietario": propietario, 
            "puuid": puuid_real,
            "profileIconId": profile_icon_id # <--- Guardamos la foto
        }).execute()

        cache_leaderboard["datos"] = []
        cache_leaderboard["ultima_actualizacion"] = 0

        return jsonify({"mensaje": "Jugador agregado con éxito"}), 200
    except Exception as e:
        log_error(f"Error agregando jugador: {e}")
        return jsonify({"error": "La cuenta ya existe o hubo un error en la base de datos."}), 500

# NUEVO: Le agregamos el <start_idx> para poder pedir de a 10 partidas
@app.route('/api/scouter/<puuid>/<modo>', defaults={'start_idx': 0})
@app.route('/api/scouter/<puuid>/<modo>/<int:start_idx>')
def get_scouter(puuid, modo, start_idx):
    partidas = []
    maestrias = [] 
    arg_tz = pytz.timezone('America/Argentina/Buenos_Aires')
    
    try:
        res_mast = requests.get(f"https://la2.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}", headers=headers)
        if res_mast.status_code == 200:
            maestrias = res_mast.json()[:3]
    except Exception as e:
        log_error(f"Error cargando maestrias: {e}")

    try:
        qids = [450, 1130] if modo == 'aram' else [QUEUES.get(modo, 420)]
        m_ids = []
        for qid in qids:
            # ACÁ SE APLICA EL START_IDX
            res_ids = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue={qid}&startTime=1767225600&start={start_idx}&count=10", headers=headers)
            if res_ids.status_code == 200:
                m_ids.extend(res_ids.json())

        partidas_temp = []
        for mid in m_ids:
            time.sleep(0.05)
            res_match = requests.get(f"https://americas.api.riotgames.com/lol/match/v5/matches/{mid}", headers=headers)
            if res_match.status_code != 200: continue
            m_data = res_match.json()
            if 'info' not in m_data: continue
            
            info = m_data['info']
            me = next(p for p in info['participants'] if p['puuid'] == puuid)
            
            q_id = info.get('queueId', 0)
            if q_id == 1130: q_name = "ARAM Kaos"
            elif q_id == 450: q_name = "ARAM Normal"
            elif modo == 'soloq': q_name = "Solo / Dúo"
            else: q_name = "Flex"

            lp_real = None 
            lp_current = 0 
            if modo != 'aram' and supabase:
                try:
                    db_res = supabase.table("match_history").select("change_lp, league_points").eq("match_id", mid).eq("puuid", puuid).execute()
                    if db_res.data:
                        lp_real = db_res.data[0]['change_lp']
                        lp_current = db_res.data[0]['league_points'] 
                except Exception: pass

            try:
                perks = me.get('perks', {}).get('styles', [])
                primary_rune = perks[0]['selections'][0]['perk'] if perks and 'selections' in perks[0] and perks[0]['selections'] else 0
                secondary_tree = perks[1]['style'] if len(perks) > 1 else 0
            except Exception: primary_rune, secondary_tree = 0, 0

            p_res = {
                "win": me['win'], 
                "remake": info.get('gameDuration', 0) < 210, 
                "champ": me['championName'], "lvl": me['champLevel'],
                "k": me['kills'], "d": me['deaths'], "a": me['assists'],
                "cs": me['totalMinionsKilled'] + me['neutralMinionsKilled'],
                "items": [me.get(f'item{i}', 0) for i in range(7)],
                "role": me.get('individualPosition', 'ARAM'),
                "summoners": [SUMMONERS.get(me.get('summoner1Id'), "SummonerFlash"), SUMMONERS.get(me.get('summoner2Id'), "SummonerFlash")],
                "runes": [primary_rune, secondary_tree],
                "lp_change": lp_real,
                "lp_current": lp_current, 
                "duracion": f"{info['gameDuration'] // 60}:{info['gameDuration'] % 60:02d}",
                "fecha": datetime.fromtimestamp(info['gameEndTimestamp']/1000, tz=pytz.utc).astimezone(arg_tz).strftime('%d/%m %H:%M'),
                "queue_name": q_name,
                "team1": [{"name": p['riotIdGameName'], "champ": p['championName']} for p in info['participants'][:5]],
                "team2": [{"name": p['riotIdGameName'], "champ": p['championName']} for p in info['participants'][5:]],
                "timestamp_sort": info['gameEndTimestamp']
            }
            partidas_temp.append(p_res)
            
        partidas_temp.sort(key=lambda x: x["timestamp_sort"], reverse=True)
        partidas = partidas_temp[:10]
        
    except Exception as e: return jsonify({"error": str(e)}), 500
    
    return jsonify({"partidas": partidas, "maestrias": maestrias})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))