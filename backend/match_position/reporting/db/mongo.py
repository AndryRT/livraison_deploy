from motor.motor_asyncio import AsyncIOMotorClient

_mongo_client = None

def get_mongo_client():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient("mongodb://mongodb:27017/")
    return _mongo_client

def get_reporting_collection():
    client = get_mongo_client()
    return client["livraison"]["reporting"]
