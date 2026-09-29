import re

with open("src/App.tsx", "r") as f:
    content = f.read()

start_marker = '<div className="grid grid-cols-1 gap-6">'
if start_marker in content:
    start_idx = content.find(start_marker)
    
    # We want to change the div immediately following the gap-6
    # from <div className=""> to <div className="bg-white p-5 rounded-[20px] shadow-sm">
    
    content = content.replace(
        '<div className="grid grid-cols-1 gap-6">\n        <div className="">',
        '<div className="grid grid-cols-1 gap-6 relative z-10">\n        <div className="bg-white p-5 sm:p-6 rounded-[20px] shadow-sm">'
    )
    with open("src/App.tsx", "w") as f:
        f.write(content)
    print("Success")
else:
    print("Not found")

