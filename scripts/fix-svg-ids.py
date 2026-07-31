import os
import re
import glob

brokers_dir = "/home/z/my-project/public/brokers"

# Fix all SVG files to use unique gradient IDs
svg_files = glob.glob(os.path.join(brokers_dir, "*.svg"))
count = 0

for svg_path in svg_files:
    with open(svg_path, "r") as f:
        content = f.read()
    
    # Get the broker name from the filename
    basename = os.path.splitext(os.path.basename(svg_path))[0]
    unique_id = f"bg_{basename}"
    
    # Replace id="bg" with unique ID
    content = content.replace('id="bg"', f'id="{unique_id}"')
    # Replace url(#bg) with the unique ID reference
    content = content.replace('url(#bg)', f'url(#{unique_id})')
    
    with open(svg_path, "w") as f:
        f.write(content)
    
    count += 1

print(f"Fixed {count} SVG files with unique gradient IDs")
