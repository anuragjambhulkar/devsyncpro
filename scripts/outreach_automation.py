import requests
import time
import random

# Configuration
SCANNER_API = "http://localhost:8081"
ORCHESTRATOR_API = "http://localhost:8082"
NICHES = ["golang/example", "torvalds/linux", "kubernetes/kubernetes", "facebook/react"]

def automate_outreach():
    print("🚀 Starting DevSyncPro Outreach Automation Engine...")
    
    while True:
        # 1. Select a random niche/target
        target = random.choice(NICHES)
        repo_url = f"https://github.com/{target}.git"
        print(f"🔍 Scanning target: {repo_url}")
        
        try:
            # 2. Trigger Scan
            scan_res = requests.post(f"{SCANNER_API}/scan", json={
                "repo_url": repo_url,
                "ref": "master"
            })
            
            if scan_res.status_code == 200:
                report_data = scan_res.json()
                report_id = report_data.get("report_id")
                
                if report_id:
                    report_url = f"http://localhost:3000?report_id={report_id}"
                    print(f"✅ Report Generated: {report_id}")
                    print(f"📩 Action: Sending 'Safety Warning' to lead with link: {report_url}")
                    
                    # 3. Simulate outreach (In real life, this would call a LinkedIn/Email API)
                    print(f"✨ Message: 'Hey! I noticed some critical circular dependencies in {target}. I generated a visual map for you here: {report_url}'")
            
        except Exception as e:
            print(f"⚠️ Error during scan: {e}")
            
        # 4. Wait for the next loop (Simulate 15 mins interval to stay under rate limits)
        print("😴 Waiting for next lead generation cycle...")
        time.sleep(10) # Set to 900 for real use (15 mins)

if __name__ == "__main__":
    automate_outreach()
