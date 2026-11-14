"""Make EARTHDATA_TOKEN visible to this process only. Reads HKCU Environment if the env var is missing. Never prints the value."""
import os
def ensure_token():
    if os.environ.get("EARTHDATA_TOKEN"):
        return True
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
            v, _ = winreg.QueryValueEx(k, "EARTHDATA_TOKEN")
        if v:
            os.environ["EARTHDATA_TOKEN"] = v
            return True
    except Exception:
        pass
    return False
if __name__ == "__main__":
    print(ensure_token())
