"""Game content: what things are, what combines into what, and what people say.

Design rule for every table in this file: there is no failure branch. Any
combination of ingredients produces *something*, and something that has a name
and a face. The fallbacks are the most interesting results, not error states.
"""

# --------------------------------------------------------------------- items

ING = "ingredient"
DOUGH = "dough"
BAKE = "bake"
TOP = "topping"
PROP = "prop"
CHAR = "character"

ITEMS = {
    # ---- ingredients ---------------------------------------------------
    "flour":      (ING, "Flour"),
    "sugar":      (ING, "Sugar"),
    "butter":     (ING, "Butter"),
    "egg":        (ING, "Egg"),
    "milk":       (ING, "Milk"),
    "chocolate":  (ING, "Chocolate"),
    "strawberry": (ING, "Strawberry"),
    "blueberry":  (ING, "Blueberries"),
    "apple":      (ING, "Apple"),
    "lemon":      (ING, "Lemon"),
    "honey":      (ING, "Honey"),
    "cinnamon":   (ING, "Cinnamon"),
    "sprinkles":  (ING, "Sprinkles"),
    "vanilla":    (ING, "Vanilla"),
    "pumpkin":    (ING, "Pumpkin"),
    "cheese":     (ING, "Cheese"),
    # ---- doughs --------------------------------------------------------
    "dough-bread":   (DOUGH, "Bread dough"),
    "dough-cookie":  (DOUGH, "Cookie dough"),
    "dough-cake":    (DOUGH, "Cake batter"),
    "dough-pastry":  (DOUGH, "Pastry dough"),
    "dough-pie":     (DOUGH, "Pie dough"),
    "dough-mystery": (DOUGH, "Mystery dough"),
    # ---- bakes ---------------------------------------------------------
    "bread":         (BAKE, "Crusty loaf"),
    "baguette":      (BAKE, "Baguette"),
    "croissant":     (BAKE, "Croissant"),
    "cookie":        (BAKE, "Cookie"),
    "cupcake":       (BAKE, "Cupcake"),
    "cake":          (BAKE, "Birthday cake"),
    "pie":           (BAKE, "Pie"),
    "donut":         (BAKE, "Donut"),
    "macaron":       (BAKE, "Macaron"),
    "muffin":        (BAKE, "Muffin"),
    "cinnamon-roll": (BAKE, "Cinnamon roll"),
    "pretzel":       (BAKE, "Pretzel"),
    "tart":          (BAKE, "Fruit tart"),
    "scone":         (BAKE, "Scone"),
    "brownie":       (BAKE, "Brownie"),
    "mystery-bake":  (BAKE, "Mystery bake"),
    # ---- toppings ------------------------------------------------------
    "top-pink":      (TOP, "Pink frosting"),
    "top-white":     (TOP, "Vanilla frosting"),
    "top-choc":      (TOP, "Chocolate frosting"),
    "top-sprinkles": (TOP, "Sprinkles"),
    "top-cherry":    (TOP, "Cherry"),
    "top-candle":    (TOP, "Candle"),
    "top-heart":     (TOP, "Little heart"),
    # ---- props ---------------------------------------------------------
    "teapot":     (PROP, "Teapot"),
    "mug":        (PROP, "Mug"),
    "cake-stand": (PROP, "Cake stand"),
    "vase":       (PROP, "Flowers"),
    "balloon":    (PROP, "Balloon"),
    "teddy":      (PROP, "Teddy"),
    "books":      (PROP, "Books"),
    "lantern":    (PROP, "Lantern"),
    "sign":       (PROP, "Sign"),
}

# A topping is drawn one way on a shelf and another way on a cake.
TOPPING_ICON = {
    "top-pink": "jar-pink", "top-white": "jar-white", "top-choc": "jar-choc",
    "top-sprinkles": "jar-sprinkles", "top-cherry": "jar-cherry",
    "top-candle": "jar-candle", "top-heart": "jar-heart",
}

CHARACTERS = {
    "poppy": "Poppy", "gran": "Gran", "dad": "Dad", "iris": "Iris",
    "max": "Max", "nell": "Nell", "theo": "Theo", "juno": "Juno",
    "cat": "Biscuit", "dog": "Pepper", "chicken": "Hen", "bird": "Robin",
}

FACES = ["face-happy", "face-calm", "face-excited", "face-surprised",
         "face-sleepy", "face-love"]


# ------------------------------------------------------------------ sources
# Tap one of these in the world and it hands you an ingredient.

SOURCES = {
    "tree":   ["apple", "apple", "lemon"],
    "bushes": ["strawberry", "blueberry", "strawberry", "blueberry"],
    "patch":  ["pumpkin", "pumpkin", "cheese"],
    "coop":   ["egg", "egg", "egg", "milk"],
    "pantry": ["flour", "sugar", "butter", "milk", "chocolate", "vanilla",
               "cinnamon", "honey", "sprinkles", "flour", "sugar", "butter"],
}


# ------------------------------------------------------------------- doughs
# Which dough a bowlful becomes. First matching rule wins. `need` must all be
# present; `any` means at least one of them.

DOUGH_RULES = [
    {"need": ["flour", "butter", "sugar"], "out": "dough-cookie"},
    {"need": ["flour", "egg"], "any": ["milk", "sugar"], "out": "dough-cake"},
    {"need": ["flour"], "any": ["apple", "strawberry", "blueberry", "lemon",
                                "pumpkin"], "out": "dough-pie"},
    {"need": ["flour", "butter"], "out": "dough-pastry"},
    {"need": ["flour", "egg"], "out": "dough-bread"},
    {"need": ["flour"], "out": "dough-bread"},
]

# What comes out of the oven. Keyed on the sorted ingredient list, joined by
# "+". These are the "real" recipes worth discovering.
RECIPES = {
    "butter+flour+sugar": "cookie",
    "butter+chocolate+flour+sugar": "brownie",
    "chocolate+flour+sugar": "brownie",
    "egg+flour+milk+sugar": "cake",
    "egg+flour+milk": "bread",
    "flour+milk": "baguette",
    "butter+egg+flour": "croissant",
    "butter+flour": "croissant",
    "egg+flour": "bread",
    "flour+sugar": "cookie",
    "butter+cinnamon+flour+sugar": "cinnamon-roll",
    "cinnamon+flour+sugar": "cinnamon-roll",
    "egg+flour+sugar": "macaron",
    "butter+flour+milk": "scone",
    "blueberry+flour+milk": "scone",
    "chocolate+egg+flour+sugar": "donut",
    "egg+flour+honey+sugar": "donut",
    "flour+honey+sugar": "donut",
    "blueberry+egg+flour+sugar": "muffin",
    "blueberry+flour+sugar": "muffin",
    "egg+flour+strawberry+sugar": "tart",
    "flour+lemon+sugar": "tart",
    "egg+flour+lemon+sugar": "tart",
    "apple+butter+flour+sugar": "pie",
    "apple+flour+sugar": "pie",
    "apple+flour": "pie",
    "flour+pumpkin+sugar": "pie",
    "egg+flour+pumpkin+sugar": "pie",
    "cheese+egg+flour": "pretzel",
    "cheese+flour": "pretzel",
    "egg+flour+sprinkles+sugar": "cupcake",
    "flour+sprinkles+sugar": "cupcake",
    "egg+flour+sugar+vanilla": "cupcake",
    "flour+sugar+vanilla": "cupcake",
    "butter+egg+flour+sugar": "cupcake",
    "flour+strawberry+sugar": "tart",
    "blueberry+flour": "muffin",
    "chocolate+flour": "brownie",
    "flour+strawberry": "tart",
}

# If no recipe matches, the dough decides.
DOUGH_DEFAULT = {
    "dough-bread": "bread",
    "dough-cookie": "cookie",
    "dough-cake": "cake",
    "dough-pastry": "croissant",
    "dough-pie": "pie",
    "dough-mystery": "mystery-bake",
}

# Names for things nobody planned. Half the fun is getting one of these.
MYSTERY_NAMES = [
    "Surprise Swirl", "Wobble Bun", "Cloud Puff", "Moonbeam Bite",
    "Giggle Cake", "Sprinkle Storm", "Secret Recipe", "The Wonky One",
    "Grand Mystery", "Sunshine Lump", "Midnight Muffin", "Happy Accident",
]


# ---------------------------------------------------------------- dialogue
# Short, warm, no instructions. Read at a 4th-grade level and never hurried.

GREETINGS = [
    "Something smells wonderful.",
    "Is the oven on already?",
    "I walked past twice just for the smell.",
    "Morning! What's fresh?",
    "I brought my own plate. Is that odd?",
    "It's warm in here. I like that.",
    "I'll take whatever is nicest.",
    "Do you have anything with berries?",
    "My friend told me about this place.",
    "I have exactly enough time for one thing.",
]

WANTS = [
    "I was hoping for a {}.",
    "A {} would be perfect.",
    "Do you have a {} today?",
    "I keep thinking about a {}.",
    "One {}, if there is one.",
]

THANKS = [
    "Oh, this is lovely.",
    "Thank you! I'll sit by the window.",
    "This is exactly right.",
    "I'm going to eat this very slowly.",
    "You're very good at this.",
    "I'll be back tomorrow.",
    "Perfect. Really.",
    "This made my whole day.",
]

IDLE = [
    "I could stay here all afternoon.",
    "The light in here is nice.",
    "Is that cinnamon?",
    "I'm just looking. Mostly.",
    "That one. No — that one.",
]

CHATTER = {
    "poppy": ["I'm going to bake something enormous.",
              "Flour first. Flour is always first.",
              "Do you think a cake can be too tall?",
              "I made this one up myself.",
              "The oven is my favourite part.",
              "One day this will be a whole restaurant."],
    "gran":  ["I've been baking since I was your size.",
              "A little more butter never hurt anyone.",
              "Let it rest. Everything is better rested.",
              "You've got good hands for this.",
              "I'll put the kettle on."],
    "dad":   ["I'll carry the heavy trays.",
              "Did somebody say cinnamon?",
              "The counter's clean. For now.",
              "I'm just here for the scraps."],
    "iris":  ["Can I do the sprinkles?",
              "I'm very good at sprinkles.",
              "What if we made it rainbow?",
              "Mine's going to have three layers."],
    "max":   ["I'll be the taste tester.",
              "What happens if we put in everything?",
              "That went in the oven a while ago...",
              "I like the wonky ones best."],
    "nell":  ["I'm writing down every recipe.",
              "This one needs a name.",
              "Ten out of ten. Maybe eleven.",
              "Can I have the corner piece?"],
    "theo":  ["Cake!", "More sprinkles please.", "Is it ready yet?",
              "I helped.", "That one's mine."],
    "juno":  ["I'll open up the front.",
              "Two more trays and we're set.",
              "Someone's at the door.",
              "Save one for me."],
    "cat":   ["Mrrp.", "*sits directly on the flour*", "Purr.",
              "*knocks one thing off the counter*"],
    "dog":   ["*tail thumping*", "Woof!", "*hopeful eyes*",
              "*already under the table*"],
    "chicken": ["Bok.", "*lays an egg, very pleased*", "Bawk bawk."],
    "bird":  ["*tweet*", "*hops closer*", "*steals one crumb*"],
}

OVEN_LINES = ["Something's baking...", "Nearly...", "It's rising!",
              "Almost ready...", "Smells good already."]
