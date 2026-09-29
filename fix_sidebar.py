import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Change Sidebar signature
old_sig = "const Sidebar = ({ active, onAction }: { active: string, onAction: (action: string) => void }) => {"
new_sig = "const Sidebar = ({ active, onAction, isOpen, onClose }: { active: string, onAction: (action: string) => void, isOpen: boolean, onClose: () => void }) => {"
content = content.replace(old_sig, new_sig)

# Remove useState from Sidebar
old_use_state = "const [isOpen, setIsOpen] = useState(false);"
content = content.replace(old_use_state, "")

# Remove Mobile Toggle from Sidebar completely
toggle_regex = re.compile(r'\{\/\*\s*Mobile Toggle\s*\*\/\}.*?<\/button>', re.DOTALL)
content = toggle_regex.sub('', content)

# Change setIsOpen(false) to onClose() in Sidebar
content = content.replace("setIsOpen(false)", "onClose()")

# Update App.tsx render to pass the props
old_render = """      <Sidebar 
        active={activeTab} 
        onAction={handleSidebarAction} 
      />"""
new_render = """      <Sidebar 
        active={activeTab} 
        onAction={handleSidebarAction} 
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />"""
content = content.replace(old_render, new_render)

# But wait, there is a class for lg:hidden menu in the header? Let's check the header in App.tsx.
# Ensure the header button toggles the sidebar on mobile only? No, maybe lg:hidden
header_menu_start = content.find('<button onClick={() => setSidebarOpen(true)}')
if header_menu_start != -1:
    header_menu_end = content.find('</button>', header_menu_start) + 9
    old_button = content[header_menu_start:header_menu_end]
    if 'lg:hidden' not in old_button:
        new_button = old_button.replace('className="', 'className="lg:hidden ')
        content = content.replace(old_button, new_button)

with open("src/App.tsx", "w") as f:
    f.write(content)

