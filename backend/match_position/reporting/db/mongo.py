from motor.motor_asyncio import AsyncIOMotorClient

_mongo_client = None

def get_mongo_client():
    global _mongo_client
    if _mongo_client is None:
        import os
        mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")
        _mongo_client = AsyncIOMotorClient(mongo_uri)
    return _mongo_client

def get_reporting_collection():
    client = get_mongo_client()
    return client["livraison"]["reporting"]
