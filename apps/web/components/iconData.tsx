//
// Finance
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import PaymentsIcon from "@mui/icons-material/Payments";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";

// Food & Shopping
import RestaurantIcon from "@mui/icons-material/Restaurant";
import LocalGroceryStoreIcon from "@mui/icons-material/LocalGroceryStore";
import LocalCafeIcon from "@mui/icons-material/LocalCafe";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";

// Transport & Travel
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import DirectionsBikeIcon from "@mui/icons-material/DirectionsBike";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import TrainIcon from "@mui/icons-material/Train";
import DirectionsBusIcon from "@mui/icons-material/DirectionsBus";
import FlightIcon from "@mui/icons-material/Flight";

// Home & Utilities
import ApartmentIcon from "@mui/icons-material/Apartment";
import BoltIcon from "@mui/icons-material/Bolt";
import WaterDropIcon from "@mui/icons-material/WaterDrop";
import WifiIcon from "@mui/icons-material/Wifi";
import BuildIcon from "@mui/icons-material/Build";
import HomeIcon from "@mui/icons-material/Home";

// Education
import SchoolIcon from "@mui/icons-material/School";
import MenuBookIcon from "@mui/icons-material/MenuBook";

// Health
import FavoriteIcon from "@mui/icons-material/Favorite";
import MedicalServicesIcon from "@mui/icons-material/MedicalServices";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";

// Pets
import PetsIcon from "@mui/icons-material/Pets";

export const ICON_SECTIONS = [
  {
    group: "Finance",
    items: [
      {
        name: "money",
        label: "Money",
        tags: ["cash", "income", "currency", "dop", "usd"],
        Icon: AttachMoneyIcon,
      },
      {
        name: "wallet",
        label: "Wallet",
        tags: ["purse", "finance", "cash"],
        Icon: AccountBalanceWalletIcon,
      },
      {
        name: "bank",
        label: "Bank",
        tags: ["savings", "account", "checking"],
        Icon: AccountBalanceIcon,
      },
      {
        name: "bills",
        label: "Bills",
        tags: ["expenses", "receipts", "services"],
        Icon: ReceiptLongIcon,
      },
      {
        name: "credit-card",
        label: "Credit Card",
        tags: ["visa", "mastercard", "debt"],
        Icon: CreditCardIcon,
      },
      {
        name: "payments",
        label: "Payments",
        tags: ["pay", "transaction", "money out"],
        Icon: PaymentsIcon,
      },
      {
        name: "investing",
        label: "Investing",
        tags: ["stocks", "growth", "profit"],
        Icon: TrendingUpIcon,
      },
      {
        name: "offer",
        label: "Offers",
        tags: ["discount", "sale", "coupon"],
        Icon: LocalOfferIcon,
      },
    ],
  },
  {
    group: "Food & Shopping",
    items: [
      {
        name: "restaurant",
        label: "Restaurant",
        tags: ["food", "eat", "dinner"],
        Icon: RestaurantIcon,
      },
      {
        name: "groceries",
        label: "Groceries",
        tags: ["supermarket", "food", "market"],
        Icon: LocalGroceryStoreIcon,
      },
      {
        name: "coffee",
        label: "Coffee",
        tags: ["drink", "cafe"],
        Icon: LocalCafeIcon,
      },
      {
        name: "cart",
        label: "Shopping Cart",
        tags: ["store", "buy"],
        Icon: ShoppingCartIcon,
      },
      {
        name: "shopping",
        label: "Shopping",
        tags: ["store", "clothes", "mall"],
        Icon: ShoppingBagIcon,
      },
    ],
  },
  {
    group: "Transport & Travel",
    items: [
      {
        name: "car",
        label: "Car",
        tags: ["vehicle", "transport"],
        Icon: DirectionsCarIcon,
      },
      {
        name: "bike",
        label: "Bike",
        tags: ["bicycle", "transport"],
        Icon: DirectionsBikeIcon,
      },
      {
        name: "gas",
        label: "Gas Station",
        tags: ["fuel", "vehicle"],
        Icon: LocalGasStationIcon,
      },
      {
        name: "train",
        label: "Train",
        tags: ["metro", "rail"],
        Icon: TrainIcon,
      },
      {
        name: "bus",
        label: "Bus",
        tags: ["transport", "public"],
        Icon: DirectionsBusIcon,
      },
      {
        name: "plane",
        label: "Flight",
        tags: ["travel", "trip"],
        Icon: FlightIcon,
      },
    ],
  },
  {
    group: "Home & Utilities",
    items: [
      {
        name: "home",
        label: "Home",
        tags: ["house", "rent"],
        Icon: HomeIcon,
      },
      {
        name: "apartment",
        label: "Apartment",
        tags: ["house", "living"],
        Icon: ApartmentIcon,
      },
      {
        name: "electricity",
        label: "Electricity",
        tags: ["light bill", "energy"],
        Icon: BoltIcon,
      },
      {
        name: "water",
        label: "Water",
        tags: ["utilities", "aqua"],
        Icon: WaterDropIcon,
      },
      {
        name: "internet",
        label: "Internet",
        tags: ["wifi", "data"],
        Icon: WifiIcon,
      },
      {
        name: "maintenance",
        label: "Maintenance",
        tags: ["repair", "fix"],
        Icon: BuildIcon,
      },
    ],
  },
  {
    group: "Education",
    items: [
      {
        name: "school",
        label: "School",
        tags: ["learning", "study"],
        Icon: SchoolIcon,
      },
      {
        name: "books",
        label: "Books",
        tags: ["reading", "study"],
        Icon: MenuBookIcon,
      },
    ],
  },
  {
    group: "Health",
    items: [
      {
        name: "health",
        label: "Health",
        tags: ["medical", "doctor"],
        Icon: FavoriteIcon,
      },
      {
        name: "medicine",
        label: "Medicine",
        tags: ["pharmacy", "pills"],
        Icon: MedicalServicesIcon,
      },
      {
        name: "fitness",
        label: "Fitness",
        tags: ["gym", "exercise"],
        Icon: FitnessCenterIcon,
      },
    ],
  },
  {
    group: "Pets",
    items: [
      {
        name: "pets",
        label: "Pets",
        tags: ["animals", "dogs", "cats"],
        Icon: PetsIcon,
      },
    ],
  },
];

export const FLAT_ICON_LIST = ICON_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({
    ...item,
    section: section.group,
    searchable: [
      item.name.toLowerCase(),
      item.label.toLowerCase(),
      ...item.tags.map((t) => t.toLowerCase()),
    ].join(" "),
  })),
);
