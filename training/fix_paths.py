
import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent.absolute()
REGISTRY_FILE = BASE_DIR / 'models_registry.json'
RUNS_DIR = BASE_DIR / 'runs'

def fix_paths():
    print(f"Checking registry at: {REGISTRY_FILE}")
    
    if not REGISTRY_FILE.exists():
        print("Registry file not found!")
        return

    with open(REGISTRY_FILE, 'r', encoding='utf-8') as f:
        registry = json.load(f)

    updated_count = 0
    
    for model in registry['models']:
        current_path = Path(model['model_path'])
        
        # Check if current path exists
        if current_path.exists():
            continue
            
        print(f"Model {model['name']} ({model['id']}) path not found: {current_path}")
        
        # Try to find in local runs dir
        run_name = model.get('run_name')
        if not run_name:
            # Try to extract from path
            parts = current_path.parts
            for part in parts:
                if part.startswith('train_'):
                    run_name = part
                    break
        
        if run_name:
            # Check standard yolo structure
            local_path = RUNS_DIR / run_name / 'weights' / 'best.pt'
            
            if local_path.exists():
                print(f"  -> Found local match: {local_path}")
                model['model_path'] = str(local_path)
                updated_count += 1
            else:
                # Try locating without 'weights' folder or just file name
                print(f"  -> Local candidate not found: {local_path}")
        else:
            print("  -> Could not determine run_name")

    if updated_count > 0:
        print(f"Updating {updated_count} models...")
        with open(REGISTRY_FILE, 'w', encoding='utf-8') as f:
            json.dump(registry, f, ensure_ascii=False, indent=2)
        print("Registry updated successfully.")
    else:
        print("No models needed updates.")

if __name__ == "__main__":
    fix_paths()
