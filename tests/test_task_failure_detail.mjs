import assert from 'node:assert/strict';
import {taskFailureDetail} from '../backend/task-failure-detail.mjs';
assert.match(taskFailureDetail(Error('timeout waiting for WeekOrderResponse'),'runWeekOrders'),/runWeekOrders.*WeekOrderResponse.*逾时/);
assert.match(taskFailureDetail(Error('unknown_shop_inventory'),'runShops'),/unknown_shop_inventory/);
assert.match(taskFailureDetail(new TypeError('synthetic-private-payload'),'runWeekOrders'),/程序类型错误/);
assert.ok(!taskFailureDetail(Error('token=synthetic-private-payload'),'runWeekOrders').includes('synthetic-private-payload'));
assert.ok(!taskFailureDetail(Error('failure'),'bad token=synthetic-private-payload').includes('synthetic-private-payload'));
const prompt=Error('private');prompt.request='RepairFleetRequest';assert.match(taskFailureDetail(prompt,'runIdleFleetRepair'),/RepairFleetRequest/);
console.log('PASS stop diagnostics name safe modules and response timeouts, without exposing arbitrary error contents');
