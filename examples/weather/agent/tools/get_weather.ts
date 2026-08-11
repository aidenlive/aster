import { defineTool } from "aster/tools";
import { z } from "zod";

export default defineTool({
  description: "Return mock weather data for a city.",
  inputSchema: z.object({ city: z.string().min(1) }),
  execute({ city }) {
    const conditions = ["Sunny", "Cloudy", "Rainy", "Windy"];
    const seed = [...city].reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
      city,
      condition: conditions[seed % conditions.length],
      temperatureC: 8 + (seed % 22),
      mocked: true,
    };
  },
});
