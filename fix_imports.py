import re

with open("src/App.tsx", "r") as f:
    content = f.read()

content = content.replace("import { motion, AnimatePresence } from 'motion/react';", "import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';")

with open("src/App.tsx", "w") as f:
    f.write(content)
