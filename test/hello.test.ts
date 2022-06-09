import 'jest';

import { hello } from '../src/index'

describe('status integration tests', () => {
    it('should return hello world', () => {
        expect(hello()).toBe('hello world');
    })
});
