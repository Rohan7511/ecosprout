const constants = require('../constants.js');
global.ECOSPROUT_REFERENCE = constants.ECOSPROUT_REFERENCE;

const CarbonEngine = require('../carbon-engine.js');

describe('CarbonEngine', () => {
  describe('estimateProduct', () => {
    it('should calculate default product footprint', async () => {
      const result = await CarbonEngine.estimateProduct({ title: 'Generic Item' });
      expect(result.manufacturingKg).toBeGreaterThan(0);
      expect(result.category).toBe('product');
    });

    it('should identify categories properly', async () => {
      const result = await CarbonEngine.estimateProduct({ title: 'Gaming Laptop' });
      expect(result.category).toBe('laptop');
      expect(result.manufacturingKg).toBeGreaterThan(200);
    });

    it('should adjust for shipping speed', async () => {
      const std = await CarbonEngine.estimateProduct({ title: 'Book', shippingText: 'Standard shipping' });
      const exp = await CarbonEngine.estimateProduct({ title: 'Book', shippingText: 'Same day delivery' });
      expect(exp.shippingKg).toBeGreaterThan(std.shippingKg);
      expect(exp.shippingSpeed).toBe('express');
      expect(std.shippingSpeed).toBe('standard');
    });

    it('should calculate material multiplier correctly', async () => {
      const plastic = await CarbonEngine.estimateProduct({ title: 'Toy', materials: ['plastic'] });
      const wood = await CarbonEngine.estimateProduct({ title: 'Toy', materials: ['wood'] });
      expect(plastic.manufacturingKg).toBeGreaterThan(wood.manufacturingKg);
    });
  });

  describe('estimateFlight', () => {
    it('should calculate direct flight correctly', () => {
      const result = CarbonEngine.estimateFlight({ originCode: 'JFK', destCode: 'LHR', stops: 0, cabin: 'economy' });
      expect(result.distanceKm).toBeGreaterThan(5000);
      expect(result.stops).toBe(0);
      expect(result.estimatedKg).toBe(result.directKg);
      expect(result.mode).toBe('precise');
    });

    it('should penalize for stops', () => {
      const direct = CarbonEngine.estimateFlight({ originCode: 'JFK', destCode: 'LHR', stops: 0, cabin: 'economy' });
      const layover = CarbonEngine.estimateFlight({ originCode: 'JFK', destCode: 'LHR', stops: 1, cabin: 'economy' });
      expect(layover.estimatedKg).toBeGreaterThan(direct.estimatedKg);
      expect(layover.savingsVsDirect).toBeGreaterThan(0);
    });

    it('should apply cabin multipliers', () => {
      const economy = CarbonEngine.estimateFlight({ originCode: 'JFK', destCode: 'LHR', stops: 0, cabin: 'economy' });
      const business = CarbonEngine.estimateFlight({ originCode: 'JFK', destCode: 'LHR', stops: 0, cabin: 'business' });
      expect(business.estimatedKg).toBeGreaterThan(economy.estimatedKg);
    });

    it('should fallback to generic if unknown airport', () => {
      const result = CarbonEngine.estimateFlight({ originCode: 'XXX', destCode: 'YYY', stops: 0, cabin: 'economy' });
      expect(result.mode).toBe('generic');
      expect(result.confidence).toBe('Low');
    });
  });

  describe('estimateFoodCart', () => {
    it('should categorize plant based correctly', () => {
      const result = CarbonEngine.estimateFoodCart(['Vegan Salad', 'Tofu Stir Fry']);
      expect(result.tier).toBe('green');
      expect(result.counts.plantBased).toBe(2);
    });

    it('should categorize heavy meat correctly', () => {
      const result = CarbonEngine.estimateFoodCart(['Beef Steak', 'Bacon Burger']);
      expect(result.tier).toBe('heavy');
      expect(result.counts.redMeat).toBe(2);
    });

    it('should identify balanced meals', () => {
      const result = CarbonEngine.estimateFoodCart(['Beef Steak', 'Vegan Salad', 'Tofu Stir Fry']);
      expect(result.tier).toBe('green'); // 1 heavy, 2 plant -> green
    });

    it('should adjust for large servings', () => {
      const small = CarbonEngine.estimateFoodCart(['small chicken']);
      const large = CarbonEngine.estimateFoodCart(['large chicken']);
      expect(large.totalKg).toBeGreaterThan(small.totalKg);
    });
  });
});
