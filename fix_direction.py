import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Add direction state and handleSetPeriod
old_states = """  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [period, setPeriod] = useState('today');"""

new_states = """  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [period, setPeriod] = useState('today');
  const [direction, setDirection] = useState(1);

  const handleSetPeriod = (newPeriod: string) => {
    const order = { 'today': 0, '7d': 1, '30d': 2 };
    if (order[newPeriod as keyof typeof order] > order[period as keyof typeof order]) {
      setDirection(1);
    } else if (order[newPeriod as keyof typeof order] < order[period as keyof typeof order]) {
      setDirection(-1);
    }
    setPeriod(newPeriod);
  };"""
content = content.replace(old_states, new_states)

# Replace setPeriod with handleSetPeriod in the buttons
content = content.replace("onClick={() => setPeriod('today')}", "onClick={() => handleSetPeriod('today')}")
content = content.replace("onClick={() => setPeriod('7d')}", "onClick={() => handleSetPeriod('7d')}")
content = content.replace("onClick={() => setPeriod('30d')}", "onClick={() => handleSetPeriod('30d')}")

# Update motion.div animation
old_motion = """          <AnimatePresence mode="wait">
            <motion.div
              key={period}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >"""

new_motion = """          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={period}
              custom={direction}
              initial={(dir) => ({ opacity: 0, x: dir === 1 ? 15 : -15 })}
              animate={{ opacity: 1, x: 0 }}
              exit={(dir) => ({ opacity: 0, x: dir === 1 ? -15 : 15 })}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >"""
content = content.replace(old_motion, new_motion)

with open("src/App.tsx", "w") as f:
    f.write(content)
