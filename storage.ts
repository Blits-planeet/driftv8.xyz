import {
  type Order,
  type InsertOrder,
  type CustomOrder,
  type InsertCustomOrder,
  type ContactSubmission,
  type InsertContactSubmission,
  type CartItem,
  type InsertCartItem,
  type Donation,
  type InsertDonation,
  webhookEvents,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { getDb } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Orders
  getOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderRating(id: string, rating: number): Promise<Order | undefined>;

  // Custom Orders
  getCustomOrders(): Promise<CustomOrder[]>;
  getCustomOrder(id: string): Promise<CustomOrder | undefined>;
  createCustomOrder(customOrder: InsertCustomOrder): Promise<CustomOrder>;

  // Contact Submissions
  getContactSubmissions(): Promise<ContactSubmission[]>;
  createContactSubmission(submission: InsertContactSubmission): Promise<ContactSubmission>;

  // Cart Items
  getCartItems(): Promise<CartItem[]>;
  getCartItem(id: string): Promise<CartItem | undefined>;
  addCartItem(item: InsertCartItem): Promise<CartItem>;
  updateCartItemQuantity(id: string, quantity: number): Promise<CartItem | undefined>;
  removeCartItem(id: string): Promise<boolean>;
  clearCart(): Promise<void>;

  // Donations
  getDonations(): Promise<Donation[]>;
  createDonation(donation: InsertDonation): Promise<Donation>;

  // Webhook Event Tracking (for idempotency)
  isEventProcessed(eventId: string): Promise<boolean>;
  markEventProcessed(eventId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private orders: Map<string, Order>;
  private customOrders: Map<string, CustomOrder>;
  private contactSubmissions: Map<string, ContactSubmission>;
  private cartItems: Map<string, CartItem>;
  private donations: Map<string, Donation>;
  private processedEvents: Set<string>;
  private orderCounter: number;

  constructor() {
    this.orders = new Map();
    this.customOrders = new Map();
    this.contactSubmissions = new Map();
    this.cartItems = new Map();
    this.donations = new Map();
    this.processedEvents = new Set();
    this.orderCounter = 1000;
  }
  
  private generateOrderNumber(): string {
    this.orderCounter++;
    return `ORD-${this.orderCounter}`;
  }

  // Orders
  async getOrders(): Promise<Order[]> {
    return Array.from(this.orders.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const id = randomUUID();
    const order: Order = {
      ...insertOrder,
      id,
      orderNumber: this.generateOrderNumber(),
      rating: null,
      createdAt: new Date(),
    };
    this.orders.set(id, order);
    return order;
  }

  async updateOrderRating(id: string, rating: number): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    const updatedOrder = { ...order, rating: rating.toString() };
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }

  // Custom Orders
  async getCustomOrders(): Promise<CustomOrder[]> {
    return Array.from(this.customOrders.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getCustomOrder(id: string): Promise<CustomOrder | undefined> {
    return this.customOrders.get(id);
  }

  async createCustomOrder(insertCustomOrder: InsertCustomOrder): Promise<CustomOrder> {
    const id = randomUUID();
    const customOrder: CustomOrder = {
      ...insertCustomOrder,
      paymentMethod: insertCustomOrder.paymentMethod ?? null,
      imageUrls: insertCustomOrder.imageUrls ?? null,
      id,
      status: "pending",
      createdAt: new Date(),
    };
    this.customOrders.set(id, customOrder);
    return customOrder;
  }

  // Contact Submissions
  async getContactSubmissions(): Promise<ContactSubmission[]> {
    return Array.from(this.contactSubmissions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createContactSubmission(
    insertSubmission: InsertContactSubmission
  ): Promise<ContactSubmission> {
    const id = randomUUID();
    const submission: ContactSubmission = {
      ...insertSubmission,
      id,
      createdAt: new Date(),
    };
    this.contactSubmissions.set(id, submission);
    return submission;
  }

  // Cart Items
  async getCartItems(): Promise<CartItem[]> {
    return Array.from(this.cartItems.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getCartItem(id: string): Promise<CartItem | undefined> {
    return this.cartItems.get(id);
  }

  async addCartItem(insertItem: InsertCartItem): Promise<CartItem> {
    const id = randomUUID();
    const item: CartItem = {
      ...insertItem,
      imageUrls: insertItem.imageUrls ?? null,
      id,
      quantity: "1",
      createdAt: new Date(),
    };
    this.cartItems.set(id, item);
    return item;
  }

  async updateCartItemQuantity(id: string, quantity: number): Promise<CartItem | undefined> {
    const item = this.cartItems.get(id);
    if (!item) return undefined;
    
    const updatedItem = { ...item, quantity: quantity.toString() };
    this.cartItems.set(id, updatedItem);
    return updatedItem;
  }

  async removeCartItem(id: string): Promise<boolean> {
    return this.cartItems.delete(id);
  }

  async clearCart(): Promise<void> {
    this.cartItems.clear();
  }

  // Donations
  async getDonations(): Promise<Donation[]> {
    return Array.from(this.donations.values()).sort(
      (a, b) => parseFloat(b.amount) - parseFloat(a.amount)
    );
  }

  async createDonation(insertDonation: InsertDonation): Promise<Donation> {
    const id = randomUUID();
    const donation: Donation = {
      ...insertDonation,
      message: insertDonation.message ?? null,
      id,
      createdAt: new Date(),
    };
    this.donations.set(id, donation);
    return donation;
  }

  // Webhook Event Tracking
  async isEventProcessed(eventId: string): Promise<boolean> {
    const db = getDb();
    if (!db) {
      // Fallback to in-memory if database not available
      return this.processedEvents.has(eventId);
    }

    try {
      const result = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.id, eventId))
        .limit(1);
      
      return result.length > 0;
    } catch (error) {
      console.error('Database error checking webhook event, falling back to in-memory:', error);
      return this.processedEvents.has(eventId);
    }
  }

  async markEventProcessed(eventId: string): Promise<void> {
    const db = getDb();
    if (!db) {
      // Fallback to in-memory if database not available
      this.processedEvents.add(eventId);
      return;
    }

    try {
      await db.insert(webhookEvents).values({ id: eventId });
      // Also store in memory as cache
      this.processedEvents.add(eventId);
    } catch (error) {
      // Ignore duplicate key errors (event already processed)
      if (error instanceof Error && error.message.includes('duplicate key')) {
        console.log(`Event ${eventId} already marked as processed in database`);
      } else {
        console.error('Database error marking webhook event, falling back to in-memory:', error);
        this.processedEvents.add(eventId);
      }
    }
  }
}

export const storage = new MemStorage();
