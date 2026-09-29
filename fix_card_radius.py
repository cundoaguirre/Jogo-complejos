import re

with open("src/App.tsx", "r") as f:
    content = f.read()

old_card = """        {/* Main Card */}
        <div className={cn("bg-white rounded-[24px] shadow-sm relative overflow-hidden", period === '30d' ? "rounded-tr-none" : "")}>"""

new_card = """        {/* Main Card */}
        <motion.div 
          animate={{ borderTopRightRadius: period === '30d' ? 0 : 24 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          className="bg-white rounded-[24px] shadow-sm relative overflow-hidden"
        >"""

content = content.replace(old_card, new_card)

# we also need to close it as </motion.div> instead of </div>
# The div ends right before the next section
old_card_end = """              </div>
            </motion.div>
          </AnimatePresence>
        </div>"""

new_card_end = """              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>"""

content = content.replace(old_card_end, new_card_end)

with open("src/App.tsx", "w") as f:
    f.write(content)
