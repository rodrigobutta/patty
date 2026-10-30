package com.capgo.capacitor_background_geolocation;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AdaptiveTrackerTest {

    private static final double LAT = -34.6;
    private static final double LON = -58.4;
    // Degrees of latitude in one meter.
    private static final double M = 1 / 111195.0;

    @Test
    public void standingStillWithJitterSendsOnlyTheHeartbeat() {
        AdaptiveTracker t = new AdaptiveTracker();
        java.util.Random r = new java.util.Random(7);
        int sent = 0;
        for (int i = 0; i < 120; i++) {
            // An hour indoors, one fix a minute: up to 80 m of wander, accuracy 30 m, speed noise below the threshold.
            double lat = LAT + (r.nextDouble() - 0.5) * 80 * M;
            int d = t.onGpsFix(lat, LON, 30f, 0.2f, i * 30000L);
            assertFalse(t.isMoving());
            assertTrue(d != AdaptiveTracker.ROUTE);
            if (d != AdaptiveTracker.NONE) sent++;
        }
        assertTrue("sent " + sent, sent <= 5);
    }

    @Test
    public void walkingSendsAPointEveryFifteenMeters() {
        AdaptiveTracker t = new AdaptiveTracker();
        t.onGpsFix(LAT, LON, 10f, 0f, 0);
        assertEquals(AdaptiveTracker.ROUTE, t.onGpsFix(LAT + 80 * M, LON, 10f, 1.4f, 60000));
        assertTrue(t.isMoving());
        int route = 0;
        double lat = LAT + 80 * M;
        for (int i = 1; i <= 60; i++) { // 5 minutes at 1.4 m/s, a fix every 5 s: 420 m
            lat += 7 * M;
            if (t.onGpsFix(lat, LON, 8f, 1.4f, 60000 + i * 5000L) == AdaptiveTracker.ROUTE) route++;
        }
        assertTrue(t.isMoving());
        assertEquals(20, route, 1);
    }

    @Test
    public void inAVehicleThePointsAreMoreSpacedOut() {
        assertEquals(15, AdaptiveTracker.spacingM(1.4), 0.01);
        assertEquals(60, AdaptiveTracker.spacingM(10), 0.01);
        assertEquals(150, AdaptiveTracker.spacingM(33), 0.01);
    }

    @Test
    public void poorFixesAreNotDrawnWhileMoving() {
        AdaptiveTracker t = new AdaptiveTracker();
        t.onGpsFix(LAT, LON, 10f, 0f, 0);
        t.onGpsFix(LAT + 80 * M, LON, 10f, 1.4f, 60000);
        assertEquals(AdaptiveTracker.NONE, t.onGpsFix(LAT + 120 * M, LON, 80f, 1.4f, 65000));
        // Still bad after a minute and far from the last one sent: useful only for presence.
        assertEquals(AdaptiveTracker.COARSE, t.onGpsFix(LAT + 300 * M, LON, 80f, 1.4f, 125000));
    }

    @Test
    public void stoppingGoesBackToTheSlowGps() {
        AdaptiveTracker t = new AdaptiveTracker();
        t.onGpsFix(LAT, LON, 10f, 0f, 0);
        t.onGpsFix(LAT + 80 * M, LON, 10f, 1.4f, 60000);
        assertTrue(t.isMoving());
        assertEquals(AdaptiveTracker.NONE, t.onGpsFix(LAT + 85 * M, LON, 10f, 0f, 120000));
        assertTrue(t.isMoving());
        t.onGpsFix(LAT + 82 * M, LON, 10f, 0f, 181000);
        assertFalse(t.isMoving());
    }

    @Test
    public void silentGpsExpiresTheMovingState() {
        AdaptiveTracker t = new AdaptiveTracker();
        t.onGpsFix(LAT, LON, 10f, 0f, 0);
        t.onGpsFix(LAT + 80 * M, LON, 10f, 1.4f, 60000);
        assertFalse(t.expire(120000));
        assertTrue(t.expire(181000));
        assertFalse(t.isMoving());
    }

    @Test
    public void wanderingWithSpeedNoiseCannotKeepTheGpsOn() {
        AdaptiveTracker t = new AdaptiveTracker();
        t.onGpsFix(LAT, LON, 10f, 0f, 0);
        t.onGpsFix(LAT + 80 * M, LON, 10f, 1.4f, 60000);
        boolean norte = true;
        long now = 60000;
        for (int i = 0; i < 20 && t.isMoving(); i++) {
            now += 30000;
            t.onGpsFix(LAT + (norte ? 80 : 45) * M, LON, 10f, 0.8f, now);
            norte = !norte;
        }
        assertFalse(t.isMoving());
    }

    @Test
    public void networkFixesAreOnlyForPresence() {
        AdaptiveTracker t = new AdaptiveTracker();
        assertEquals(AdaptiveTracker.COARSE, t.onCoarseFix(LAT, LON, 0));
        assertEquals(AdaptiveTracker.NONE, t.onCoarseFix(LAT + 50 * M, LON, 60000));
        assertEquals(AdaptiveTracker.COARSE, t.onCoarseFix(LAT + 200 * M, LON, 120000));
        assertFalse(t.isMoving());
    }
}
