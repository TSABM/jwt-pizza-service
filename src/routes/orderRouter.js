const express = require('express');
const config = require('../config.js');
const { Role, DB } = require('../database/database.js');
const { authRouter } = require('./authRouter.js');
const { asyncHandler, StatusCodeError } = require('../endpointHelper.js');
const { incrementPizzasMade, incrementFailedPizzas, addPizzaLatency, addLatency } = require('../metrics.js');
const logger = require('../logger.js')

const orderRouter = express.Router();

orderRouter.endpoints = [
  {
    method: 'GET',
    path: '/api/order/menu',
    description: 'Get the pizza menu',
    example: `curl localhost:3000/api/order/menu`,
    response: [{ id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' }],
  },
  {
    method: 'PUT',
    path: '/api/order/menu',
    requiresAuth: true,
    description: 'Add an item to the menu',
    example: `curl -X PUT localhost:3000/api/order/menu -H 'Content-Type: application/json' -d '{ "title":"Student", "description": "No topping, no sauce, just carbs", "image":"pizza9.png", "price": 0.0001 }'  -H 'Authorization: Bearer tttttt'`,
    response: [{ id: 1, title: 'Student', description: 'No topping, no sauce, just carbs', image: 'pizza9.png', price: 0.0001 }],
  },
  {
    method: 'GET',
    path: '/api/order',
    requiresAuth: true,
    description: 'Get the orders for the authenticated user',
    example: `curl -X GET localhost:3000/api/order  -H 'Authorization: Bearer tttttt'`,
    response: { dinerId: 4, orders: [{ id: 1, franchiseId: 1, storeId: 1, date: '2024-06-05T05:14:40.000Z', items: [{ id: 1, menuId: 1, description: 'Veggie', price: 0.05 }] }], page: 1 },
  },
  {
    method: 'POST',
    path: '/api/order',
    requiresAuth: true,
    description: 'Create a order for the authenticated user',
    example: `curl -X POST localhost:3000/api/order -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}'  -H 'Authorization: Bearer tttttt'`,
    response: { order: { franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: 'Veggie', price: 0.05 }], id: 1 }, jwt: '1111111111' },
  },
];

// getMenu
orderRouter.get(
  '/menu',
  asyncHandler(async (req, res) => {
    const start = Date.now();
    const menu = await DB.getMenu();
    const end = Date.now();
    addLatency(end - start);
    res.send(menu);
  })
);

// addMenuItem
orderRouter.put(
  '/menu',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const start = Date.now();
    if (!req.user.isRole(Role.Admin)) {
      let errorMessage = 'unable to add menu item'
      logger.logUnhandledRouterExeptions(errorMessage, true)
      throw new StatusCodeError(errorMessage, 403);
    }
    const addMenuItemReq = req.body;
    await DB.addMenuItem(addMenuItemReq);
    const menu = await DB.getMenu();
    const end = Date.now();
    addLatency(end - start);
    res.send(menu);
  })
);

// getOrders
orderRouter.get(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const start = Date.now();
    const orders = await DB.getOrders(req.user, req.query.page);
    const end = Date.now();
    addLatency(end - start);
    res.json(orders);
  })
);

// createOrder
orderRouter.post(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
      const start = Date.now();
      
      const orderReq = req.body;
      const order = await DB.addDinerOrder(req.user, orderReq);
      const orderInfo = { diner: { id: req.user.id, name: req.user.name, email: req.user.email }, order }
        const r = await fetch(`${config.factory.url}/api/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${config.factory.apiKey}` },
        body: JSON.stringify(orderInfo),
      });
      const j = await r.json();

      const end = Date.now();
      addLatency(end - start);
      addPizzaLatency(end-start)
      
      if (r.ok) {
        let totalPizzasOrdered = orderReq.items.length;//num of items in order
        let costOfOrder = orderReq.items.reduce((sum, item) => sum + item.price, 0);//sum the costs of items
        incrementPizzasMade(totalPizzasOrdered, costOfOrder);
        logger.logFactoryRequest(orderInfo)
        res.send({ order, reportSlowPizzaToFactoryUrl: j.reportUrl, jwt: j.jwt });
      } else {
        incrementFailedPizzas()
        logger.logFactoryRequest(orderInfo, true)
        res.status(500).send({ message: 'Failed to fulfill order at factory', reportPizzaCreationErrorToPizzaFactoryUrl: j.reportUrl });
      }
  })

);

module.exports = orderRouter;