// Bitget API Client for Spot Trading

const BITGET_API_BASE = 'https://api.bitget.com';

// Sign request with HMAC-SHA256
async function signRequest(method, requestPath, body, timestamp, secret) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const message = timestamp + method.toUpperCase() + requestPath + bodyStr;

  const encoder = new TextEncoder();
  const messageBuffer = encoder.encode(message);
  const keyBuffer = encoder.encode(secret);

  const key = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageBuffer);
  const signatureArray = Array.from(new Uint8Array(signature));
  return btoa(String.fromCharCode.apply(null, signatureArray));
}

export async function getBalance(env) {
  try {
    const apiKey = env.BITGET_API_KEY;
    const secret = env.BITGET_API_SECRET;
    const passphrase = env.BITGET_PASSPHRASE;

    if (!apiKey || !secret || !passphrase) {
      return { error: 'Bitget credentials not configured' };
    }

    const requestPath = '/api/v2/spot/account/assets';
    const timestamp = Date.now().toString();
    const signature = await signRequest('GET', requestPath, null, timestamp, secret);

    const response = await fetch(BITGET_API_BASE + requestPath, {
      method: 'GET',
      headers: {
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json',
        'locale': 'en-US'
      }
    });

    const data = await response.json();

    if (data.code !== '00000') {
      const errorMsg = data.msg || JSON.stringify(data);
      console.error('Bitget balance error:', errorMsg);
      return { error: errorMsg };
    }

    // Extract USDT and BTC balances
    const assets = data.data || [];
    let usdtBalance = 0;
    let btcBalance = 0;

    assets.forEach(asset => {
      if (asset.coin === 'USDT') usdtBalance = parseFloat(asset.available) || 0;
      if (asset.coin === 'BTC') btcBalance = parseFloat(asset.available) || 0;
    });

    // Fetch current USD to MYR exchange rate
    let myrRate = 4.5; // fallback rate
    try {
      const rateRes = await fetch('https://v6.exchangerate-api.com/v6/latest/USD');
      const rateData = await rateRes.json();
      if (rateData.conversion_rates && rateData.conversion_rates.MYR) {
        myrRate = rateData.conversion_rates.MYR;
      }
    } catch (e) {
      console.warn('Could not fetch live exchange rate, using fallback');
    }

    const totalUSD = usdtBalance + (btcBalance * 43000);
    const totalMYR = totalUSD * myrRate;

    return {
      success: true,
      usdtBalance: usdtBalance.toFixed(2),
      btcBalance: btcBalance.toFixed(8),
      totalUSD: totalUSD.toFixed(2),
      totalMYR: totalMYR.toFixed(2),
      myrRate: myrRate.toFixed(4)
    };
  } catch (e) {
    console.error('Bitget balance fetch error:', e);
    return { error: e.message };
  }
}

export async function placeOrder(env, side, quoteSize) {
  try {
    const apiKey = env.BITGET_API_KEY;
    const secret = env.BITGET_API_SECRET;
    const passphrase = env.BITGET_PASSPHRASE;

    if (!apiKey || !secret || !passphrase) {
      return { error: 'Bitget credentials not configured' };
    }

    const requestPath = '/api/v2/spot/trade/place-order';
    const timestamp = Date.now().toString();

    const body = {
      symbol: 'BTCUSDT',
      side: side.toLowerCase(), // 'buy' or 'sell'
      orderType: 'market',
      force: 'gtc',
      quoteSize: parseFloat(quoteSize).toFixed(2)
    };

    const signature = await signRequest('POST', requestPath, body, timestamp, secret);

    const response = await fetch(BITGET_API_BASE + requestPath, {
      method: 'POST',
      headers: {
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json',
        'locale': 'en-US'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.code !== '00000') {
      console.error('Bitget order error:', data.msg);
      return { error: data.msg || 'Failed to place order' };
    }

    return {
      success: true,
      orderId: data.data?.orderId || 'pending',
      side: side,
      amount: quoteSize,
      status: 'submitted'
    };
  } catch (e) {
    console.error('Bitget order placement error:', e);
    return { error: e.message };
  }
}

// ── Place Limit Order (controlled entry at specific price) ──────────────────
export async function placeLimitOrder(env, side, quoteSize, price) {
  try {
    const apiKey = env.BITGET_API_KEY;
    const secret = env.BITGET_API_SECRET;
    const passphrase = env.BITGET_PASSPHRASE;

    if (!apiKey || !secret || !passphrase) {
      return { error: 'Bitget credentials not configured' };
    }

    const requestPath = '/api/v2/spot/trade/place-order';
    const timestamp = Date.now().toString();

    const body = {
      symbol: 'BTCUSDT',
      side: side.toLowerCase(),
      orderType: 'limit',
      force: 'gtc',
      quoteSize: parseFloat(quoteSize).toFixed(2),
      price: parseFloat(price).toFixed(2)
    };

    const signature = await signRequest('POST', requestPath, body, timestamp, secret);

    const response = await fetch(BITGET_API_BASE + requestPath, {
      method: 'POST',
      headers: {
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json',
        'locale': 'en-US'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.code !== '00000') {
      console.error('Bitget limit order error:', data.msg);
      return { error: data.msg || 'Failed to place limit order' };
    }

    return {
      success: true,
      orderId: data.data?.orderId || 'pending',
      side: side,
      orderType: 'limit',
      price: price,
      amount: quoteSize,
      status: 'submitted'
    };
  } catch (e) {
    console.error('Bitget limit order placement error:', e);
    return { error: e.message };
  }
}

// ── Place Stop-Loss Order ────────────────────────────────────────────────────
export async function placeStopLossOrder(env, side, size, stopPrice) {
  try {
    const apiKey = env.BITGET_API_KEY;
    const secret = env.BITGET_API_SECRET;
    const passphrase = env.BITGET_PASSPHRASE;

    if (!apiKey || !secret || !passphrase) {
      return { error: 'Bitget credentials not configured' };
    }

    const requestPath = '/api/v2/spot/trade/place-order';
    const timestamp = Date.now().toString();

    // Stop-loss uses base asset size, not quote size
    const body = {
      symbol: 'BTCUSDT',
      side: side.toLowerCase(),
      orderType: 'stop_loss',
      force: 'gtc',
      size: parseFloat(size).toFixed(8),
      triggerPrice: parseFloat(stopPrice).toFixed(2),
      triggerSide: side.toLowerCase() === 'buy' ? 'sell' : 'buy'
    };

    const signature = await signRequest('POST', requestPath, body, timestamp, secret);

    const response = await fetch(BITGET_API_BASE + requestPath, {
      method: 'POST',
      headers: {
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json',
        'locale': 'en-US'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.code !== '00000') {
      console.error('Bitget stop-loss order error:', data.msg);
      return { error: data.msg || 'Failed to place stop-loss order' };
    }

    return {
      success: true,
      orderId: data.data?.orderId || 'pending',
      side: side,
      orderType: 'stop_loss',
      stopPrice: stopPrice,
      status: 'submitted'
    };
  } catch (e) {
    console.error('Bitget stop-loss order placement error:', e);
    return { error: e.message };
  }
}

// ── Place Take-Profit Order ─────────────────────────────────────────────────
export async function placeTakeProfitOrder(env, side, size, triggerPrice) {
  try {
    const apiKey = env.BITGET_API_KEY;
    const secret = env.BITGET_API_SECRET;
    const passphrase = env.BITGET_PASSPHRASE;

    if (!apiKey || !secret || !passphrase) {
      return { error: 'Bitget credentials not configured' };
    }

    const requestPath = '/api/v2/spot/trade/place-order';
    const timestamp = Date.now().toString();

    const body = {
      symbol: 'BTCUSDT',
      side: side.toLowerCase(),
      orderType: 'take_profit',
      force: 'gtc',
      size: parseFloat(size).toFixed(8),
      triggerPrice: parseFloat(triggerPrice).toFixed(2),
      triggerSide: side.toLowerCase() === 'buy' ? 'sell' : 'buy'
    };

    const signature = await signRequest('POST', requestPath, body, timestamp, secret);

    const response = await fetch(BITGET_API_BASE + requestPath, {
      method: 'POST',
      headers: {
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json',
        'locale': 'en-US'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.code !== '00000') {
      console.error('Bitget take-profit order error:', data.msg);
      return { error: data.msg || 'Failed to place take-profit order' };
    }

    return {
      success: true,
      orderId: data.data?.orderId || 'pending',
      side: side,
      orderType: 'take_profit',
      triggerPrice: triggerPrice,
      status: 'submitted'
    };
  } catch (e) {
    console.error('Bitget take-profit order placement error:', e);
    return { error: e.message };
  }
}

export async function getOpenOrders(env) {
  try {
    const apiKey = env.BITGET_API_KEY;
    const secret = env.BITGET_API_SECRET;
    const passphrase = env.BITGET_PASSPHRASE;

    if (!apiKey || !secret || !passphrase) {
      return { error: 'Bitget credentials not configured' };
    }

    const requestPath = '/api/v2/spot/trade/unfilled-orders?symbol=BTCUSDT';
    const timestamp = Date.now().toString();
    const signature = await signRequest('GET', requestPath, null, timestamp, secret);

    const response = await fetch(BITGET_API_BASE + requestPath, {
      method: 'GET',
      headers: {
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json',
        'locale': 'en-US'
      }
    });

    const data = await response.json();

    if (data.code !== '00000') {
      return { error: data.msg || 'Failed to fetch orders' };
    }

    const orders = data.data || [];
    return {
      success: true,
      orders: orders.map(o => ({
        orderId: o.orderId,
        symbol: o.symbol,
        side: o.side,
        size: o.size,
        price: o.price,
        status: o.status,
        createdTime: new Date(parseInt(o.createdTime)).toISOString()
      }))
    };
  } catch (e) {
    console.error('Bitget orders fetch error:', e);
    return { error: e.message };
  }
}

export async function cancelAllOrders(env) {
  try {
    const apiKey = env.BITGET_API_KEY;
    const secret = env.BITGET_API_SECRET;
    const passphrase = env.BITGET_PASSPHRASE;

    if (!apiKey || !secret || !passphrase) {
      return { error: 'Bitget credentials not configured' };
    }

    // First get all open orders
    const ordersResp = await getOpenOrders(env);
    if (ordersResp.error) return ordersResp;

    const orders = ordersResp.orders || [];
    if (orders.length === 0) {
      return { success: true, message: 'No open orders to cancel' };
    }

    // Cancel each order
    let cancelledCount = 0;
    for (const order of orders) {
      const requestPath = '/api/v2/spot/trade/cancel-order';
      const timestamp = Date.now().toString();

      const body = {
        symbol: 'BTCUSDT',
        orderId: order.orderId
      };

      const signature = await signRequest('POST', requestPath, body, timestamp, secret);

      const response = await fetch(BITGET_API_BASE + requestPath, {
        method: 'POST',
        headers: {
          'ACCESS-KEY': apiKey,
          'ACCESS-SIGN': signature,
          'ACCESS-TIMESTAMP': timestamp,
          'ACCESS-PASSPHRASE': passphrase,
          'Content-Type': 'application/json',
          'locale': 'en-US'
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      if (data.code === '00000') {
        cancelledCount++;
      }
    }

    return {
      success: true,
      message: `Cancelled ${cancelledCount} of ${orders.length} orders`
    };
  } catch (e) {
    console.error('Bitget cancel all error:', e);
    return { error: e.message };
  }
}
