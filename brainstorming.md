### Domains:
- physical AI/robotics & finance?


## Ideas:
1. X-ray glasses for robots. Point a phone or tablet at the robot and an AR overlay shows what it's about to do (planned path, target object, why it chose it), and you can ask it questions out loud: "why did you skip that part?" Why it lands: turns an opaque machine into something that explains itself, which speaks directly to the trust concerns non-technical people have about robots. Catch: AR tracking needs a lot of polish to not look janky. Fiducial markers on the robot base help a lot.

2. The audience runs the factory. Audience members scan a QR code and send orders or requests from their phones. Agents prioritize and schedule them on a live board, the twin shows the plan, and the robot fulfills them on stage. Why it lands: the judges become participants, which beats watching any demo. Catch: you're inviting chaos. Rate-limit inputs, filter nonsense requests, and have the agent handle conflicting orders gracefully as part of the show.

3. Talk to your factory. A 3D digital twin of a small robot cell (built in three.js or Isaac Sim), synced live with a real arm. Someone says "switch the line to product B and prioritize the red parts." Agents plan it, the twin plays a ghost preview of the new workflow, a person taps approve, and the real robot executes it in sync with its twin. Next to it, a "mission control" panel shows the agents' workflow as a graph lighting up step by step. Why it lands: voice in, simulated preview, real motion out. Anyone gets it immediately, and the agent graph makes the AI visible instead of a black box. Catch: the live sync between twin and robot is the hard engineering. Get that working on day one, before anything else.

4. Phone → robot training data. Film yourself doing a task with your hands (folding a cloth, stacking cups). The app tracks your hand and fingers in 3D in real time, follows the objects, and a simulated robot arm in a 3D view mirrors your movements live, then exports the recording as robot training data. Startup: crowdsourced demonstration data for physical AI, which is the field's biggest bottleneck. Anyone with a phone becomes a data collector, paid per task. Why it's impressive: you wave your hand and a robot copies you instantly on screen. Catch: turning human hand movement into robot gripper movement is approximate, so keep the arm simple (two-finger gripper) and focus on the pipeline.
!! basically a way for everyone (kind of liek social media) to record and sell data for robot training - pasisve income for individuals + win for roboptcis comapnies & AI Labs so a WIN-WIN

5. Fact-check any video. Paste a TikTok, Reel or YouTube Short. The app extracts every factual claim with timestamps, sends parallel agents to search the web for each one, and returns a verdict per claim with sources, shown as a live map of agents working in parallel. Startup: a consumer browser extension, or a tool for newsrooms. Why it's impressive: video + web search + visible parallel agents, all understandable by anyone, and timely. Catch: fact-checking is politically sensitive, so pick neutral demo videos (health myths, viral science claims) and show sources rather than just a verdict.

6. Codebase as a 3D city. Point the app at a GitHub repo. Using the long context, Kimi reads the whole codebase, and the app shows it as a 3D city: files as buildings (height = complexity), neighborhoods by module, roads for dependencies. A guide agent gives you a tour ("this is where payments happen, this tower is the riskiest file"), and you can ask questions and see the relevant buildings light up. Startup: developer onboarding, which takes new engineers weeks at most companies. Why it's impressive: turns something invisible into a navigable place, and technical judges will want to try it on their own repo. Catch: large repos exceed even a big context window, so summarize file by file first and keep the demo to mid-sized repos.
!! thsi woudl be cool but has to be expanded into an actual startup or something useful

7. Turn your room into an escape room. Take a few photos of any room. Kimi identifies the objects in it and generates an escape-room game built around them: puzzles referencing the real lamp, the books on the shelf, the poster on the wall, with clues hidden in the physical space. Players solve it by photographing the right objects in the right order. Startup: party games, team-building, or a museum and venue product. Why it's impressive: fun and fully playable by judges on stage, which beats any slide deck. Catch: least "useful" of the list, so it only wins if the hackathon rewards creativity and engagement.

8. A city of AI citizens. A miniature 3D city populated by hundreds of AI agents, each with a job, a home, opinions and a daily routine. Introduce a change ("a new metro line opens," "rent rises 20%," "a typhoon warning is issued") and watch the population react: people change commutes, businesses move, arguments break out, all visible on the map with individual agents you can click on to see what they're thinking. Why it's cool: SimCity where the people actually think. Why it matters: a sandbox for testing policies or urban plans before rolling them out. Catch: hundreds of agents can burn through your credits fast. Use a few dozen full agents plus simple rules for the crowd, and don't claim it predicts real behavior.
!! inspired by Shenzhen??





  1. RoboCFO — a robot delivery company run by AI

  You build a small simulated delivery business. Robots have batteries, carrying capacities, locations, and operating costs. Delivery requests have payouts and deadlines.

  The user gives Kimi a business objective:

  > “Earn as much as possible, but complete at least 90% of deliveries on time.”

  Kimi checks the fleet, requests cost estimates, and chooses which jobs to accept and which robots to dispatch. Your code calculates routes, costs, battery consumption, and whether an action is possible.

  The interesting part is competing priorities: a high-paying delivery might strand a robot, while charging now might mean missing a profitable order.

  Your screen would show a moving fleet, incoming orders, a financial dashboard, and a short explanation of each decision.

  Demo: Run the same set of orders through a basic nearest-robot dispatcher and your Kimi-powered dispatcher. Then block a road. Compare profit, delivery completion, and response to the disruption—without assuming Kimi will always win.

  MVP: Three robots, a grid map, one charging station, ten orders, and a handful of actions.

  Main challenge: Keeping decisions responsive. Let Kimi make decisions when meaningful events happen; your simulator handles movement continuously.

  ———

  2. BotBourse — a marketplace where robots negotiate for work

  Instead of one company controlling the fleet, imagine robots owned by different businesses competing for delivery contracts.

  Each robot has different economics:

  - A small robot is cheap but has limited capacity.
  - A large robot carries more but consumes more energy.
  - A fast robot charges a premium for urgent deliveries.

  A customer posts:

  > “Move this package to the hospital within five minutes. Maximum budget: $15.”

  Kimi generates bids for each robot based on its costs and availability. The marketplace selects a valid bid using explicit rules, then the winning robot completes the simulated delivery and receives mock payment.

  Kimi can also decide whether a robot should decline a job or subcontract it after a breakdown. You can use the same API key for these separate agent roles.

  Demo: Start a bidding round, reveal the bids and their reasoning, then disable the winning robot. Watch it seek a replacement while trying to avoid losing money.

  MVP: Three robot profiles, one type of delivery contract, one bidding round per job, and a simulated payment ledger.

  Main challenge: Making the marketplace credible. Give each bidder access only to its own information, and enforce budgets and costs in code.

  Why it stands out: The financial transaction is central to the robotics story. Negotiation also gives Kimi a natural role.

  ———

  3. RepairBank — an AI that decides how to pay for robot breakdowns

  This is a financial planning tool for a company that depends on robots.

  A robot develops a fault. The cheapest repair isn’t necessarily the cheapest business decision: waiting three days for a part could lose more revenue than renting a replacement.

  You provide synthetic maintenance reports, repair quotes, job schedules, and cash balances. Kimi gathers those facts and compares options:

   Option                Financial tradeoff
  ━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Repair immediately    Pay now and reduce downtime
  ────────────────────  ──────────────────────────────────────────────────────────
   Delay repair          Preserve cash but increase modeled failure risk
  ────────────────────  ──────────────────────────────────────────────────────────
   Rent a replacement    Add rental expense while preserving deliveries
  ────────────────────  ──────────────────────────────────────────────────────────
   Replace the robot     Large upfront cost with different future operating costs

  Your code computes the cash-flow scenarios. Kimi explains the recommendation and identifies assumptions that could change it.

  Demo: A robot fails during a busy period. Kimi initially recommends renting a replacement. Then you change the rental price or available cash and watch the recommendation update.

  MVP: One fleet, one fault scenario, three recovery options, and a cash-flow chart.

  Main challenge: Avoiding invented certainty. Label maintenance probabilities and revenue forecasts as simulation assumptions and let users adjust them.

  Why it stands out: It addresses a concrete business problem with a clear connection between engineering and finance.

  ———

  4. InvoiceGuard — a software robot that investigates suspicious payments

  This one is finance + AI automation. It fits if your hackathon accepts “robot” as a software agent; it has little physical robotics content.

  A company uploads invoices, purchase orders, supplier records, and a mock bank transaction file. Basic rules identify potential problems, then Kimi investigates them.

  For example:

  > “This invoice looks new, but its amount and purchase order match an invoice paid last week.”

  Kimi queries the relevant records, compares the evidence, and produces a case explaining whether the invoice appears valid, duplicated, or unresolved.

  Useful cases include duplicate billing, mismatched quantities, unexpected bank-detail changes, and invoices with no matching purchase order.

  Demo: Upload ten synthetic invoices containing three planted problems. Open a flagged invoice and show the exact records behind the warning. A human approves or rejects the mock payment.

  MVP: CSV inputs, three types of suspicious activity, an investigation panel, and approval buttons.

  Main challenge: Handling legitimate exceptions without flagging everything. Include a valid partial payment or recurring invoice in the demo.

  Why it stands out: It is easy to explain, test, and measure: how many planted issues did it catch, and how many valid invoices did it incorrectly flag?

  ———

  My ranking for your situation:

   Your priority                                    Best choice
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━
   Strong robotics + finance connection             RoboCFO
  ───────────────────────────────────────────────  ──────────────
   Most distinctive negotiation demo                BotBourse
  ───────────────────────────────────────────────  ──────────────
   Clear business decision with manageable scope    RepairBank
  ───────────────────────────────────────────────  ──────────────
   Easiest to validate and finish                   InvoiceGuard