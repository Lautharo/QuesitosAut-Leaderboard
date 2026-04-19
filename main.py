import requests
import json
import os # Agregamos esto para poder leer los "secretos"

# 1. Tu API Key secreta
API_KEY = os.environ.get("RIOT_API_KEY")

# Ponemos un freno de seguridad por si no encuentra la llave
if not API_KEY:
    print("❌ ERROR: No se encontró la RIOT_API_KEY.")
    exit()

# 2. La lista de tu equipo (sigue igual...)

# 2. La lista de tu equipo (Nombre, Tag)
JUGADORES = [
    {"nombre": "AU l Thxgzz", "tag": "777"},
    {"nombre": "AU l Ferry", "tag": "2504"},
    {"nombre": "AU l benji", "tag": "777"},
    {"nombre": "AU l Osiris", "tag": "2007"},
    {"nombre": "Murs", "tag": "Kaiju"},
    {"nombre": "XCriadoenLobosX", "tag": "Toxic"},
    {"nombre": "Quesito Azul", "tag": "IDK"},
    {"nombre": "Quesito Gruyere", "tag": "Out"},
]

headers = {
    "X-Riot-Token": API_KEY
}

# 3. Valores para enseñar a Python qué rango es mejor
VALOR_TIER = {
    "CHALLENGER": 9000, "GRANDMASTER": 8000, "MASTER": 7000,
    "DIAMOND": 6000, "EMERALD": 5000, "PLATINUM": 4000,
    "GOLD": 3000, "SILVER": 2000, "BRONZE": 1000,
    "IRON": 0, "UNRANKED": -1000
}

VALOR_RANK = {
    "I": 400, "II": 300, "III": 200, "IV": 100, "": 0
}

def obtener_stats_equipo():
    datos_finales = []

    for jugador in JUGADORES:
        game_name = jugador['nombre']
        tag_line = jugador['tag']
        
        try:
            print(f"🔄 Buscando a {game_name}#{tag_line}...")
            
            # PASO 1: PUUID
            url_account = f"https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}"
            res_account = requests.get(url_account, headers=headers)
            res_account.raise_for_status()
            puuid = res_account.json()['puuid']

            # PASO 2: Stats
            url_league = f"https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}"
            res_league = requests.get(url_league, headers=headers)
            res_league.raise_for_status()
            stats = res_league.json()

            soloq_stats = next((queue for queue in stats if queue['queueType'] == 'RANKED_SOLO_5x5'), None)

            # Armamos el diccionario
            datos_jugador = {
                "nombre": game_name,
                "tag": tag_line,
                "tier": "UNRANKED",
                "rank": "",
                "lp": 0,
                "wins": 0,
                "losses": 0,
                "winrate": 0,
                "total_games": 0
            }

            if soloq_stats:
                datos_jugador["tier"] = soloq_stats['tier']
                datos_jugador["rank"] = soloq_stats['rank']
                datos_jugador["lp"] = soloq_stats['leaguePoints']
                datos_jugador["wins"] = soloq_stats['wins']
                datos_jugador["losses"] = soloq_stats['losses']       

                total_games = soloq_stats['wins'] + soloq_stats['losses']

                datos_jugador["total_games"] = total_games
                datos_jugador["winrate"] = round((soloq_stats['wins'] / total_games) * 100, 1)

            datos_finales.append(datos_jugador)
            print(f"✅ Listo!")

        except requests.exceptions.RequestException as e:
            print(f"❌ Error con {game_name}#{tag_line}")

    # PASO 3: ORDENAR LA LISTA DE MEJOR A PEOR (¡Lo nuevo!)
    datos_finales.sort(key=lambda x: VALOR_TIER.get(x['tier'], -1000) + VALOR_RANK.get(x['rank'], 0) + x['lp'], reverse=True)

    # PASO 4: Guardar todo en el archivo JSON
    print("\n💾 Guardando archivo datos.json ordenado...")
    with open("datos.json", "w", encoding="utf-8") as archivo:
        json.dump(datos_finales, archivo, indent=4, ensure_ascii=False)
    
    print("🚀 ¡Proceso terminado!")

# Ejecutar la función
obtener_stats_equipo()