import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Fix Resumen general wrapping
content = content.replace(
    '<h2 className="text-[24px] font-normal text-white pb-2.5 tracking-wide">Resumen general</h2>',
    '<h2 className="text-[20px] sm:text-[24px] font-normal text-white pb-2.5 tracking-wide whitespace-nowrap">Resumen general</h2>'
)

# Fix Modo preferido wrapping
content = content.replace(
    '<span className="text-[#0BA70B] font-bold text-[13px] sm:text-[15px] mb-1.5 leading-tight">Modo preferido</span>',
    '<span className="text-[#0BA70B] font-bold text-[11px] sm:text-[14px] lg:text-[15px] mb-1.5 leading-tight whitespace-nowrap">Modo preferido</span>'
)

with open("src/App.tsx", "w") as f:
    f.write(content)

