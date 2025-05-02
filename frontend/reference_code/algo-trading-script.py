#!/usr/bin/python3
import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from sklearn.preprocessing import StandardScaler


def calculate_z_score(row, scaler):

    raw_components = {
        "RSI": row["RSI"],
        'PE_diff': row['pe'] - row['average_pe'],
        "volat": row["volat"],
        "mean50": (row["price"] - row["mean50"]) / row["price"],
        "mean200": (row["price"] - row["mean200"]) / row["price"],
        "divyield": row["divyield"],
        "div_growth_rate": row["div_growth_rate"],
        "fcf_ni_ratio": row["fcf_ni_ratio"],
    }

    # Convert dictionary to DataFrame for scaling
    components_df = pd.DataFrame([raw_components])

    # Scale the components
    scaled_components = scaler.transform(components_df)

    # Convert back to dictionary
    scaled_components_dict = dict(zip(raw_components.keys(), scaled_components[0]))

    # Apply weights (you can adjust these)
    weights = {
        "RSI": 1.1,
        "PE_diff": 1.0,
        "volat": 0.8,
        "mean50": 0.85,
        "mean200": 1.2,
        # #
        "divyield": -1.3,
        "div_growth_rate": -0.7,
        "fcf_ni_ratio": -1.2,
    }

    weighted_components = {k: v * weights[k] for k, v in scaled_components_dict.items()}
    z_score = sum(weighted_components.values())

    return z_score, weighted_components

def run_trading_algorithm(data, overweight_min_thresh):
    # Prepare the scaler
    scaler = StandardScaler()

    components_to_scale = [
        "RSI",
        "PE_diff",
        "volat",
        "mean50",
        "mean200",
        "divyield",
        "div_growth_rate",
        "fcf_ni_ratio",
    ]
    data_for_scaling = data[components_to_scale].fillna(data[components_to_scale].mean())
    
    scaler.fit(data_for_scaling)

    # scaler.fit(data[components_to_scale])

    # Calculate z-score and its components
    data["z_score"], data["z_components"] = zip(
        *data.apply(lambda row: calculate_z_score(row, scaler), axis=1)
    )

    # Filter and sort the data
    filtered_data = data[data["overamt"] < overweight_min_thresh]
    top_15 = filtered_data.nsmallest(15, "z_score")

    return top_15

def analyze_component_influence(results):
    all_components = pd.DataFrame(results["z_components"].tolist(), index=results.index)

    # Calculate the average absolute influence of each component
    avg_influence = all_components.abs().mean().sort_values(ascending=False)

    # Calculate the percentage influence
    total_influence = avg_influence.sum()
    percentage_influence = (avg_influence / total_influence * 100).round(2)

    return percentage_influence

# "SELECT * FROM prices JOIN MPT USING (symbol) JOIN sectors USING (symbol)",

def main():
    # Load your data (replace this with your actual data loading method)
    engine = create_engine("sqlite:///../portfolio.sqlite")
    data = pd.read_sql(
        "SELECT prices.symbol,prices.price,sectorshort,overamt,prices.divyield,\
        fcf_ni_ratio,volat,RSI,mean50,mean200,div_growth_rate,pe,average_pe,(pe-average_pe) as PE_diff \
        FROM prices,MPT,sectors\
        where prices.symbol = MPT.symbol and sectors.symbol = MPT.symbol",
        engine,
    )


        # Run validation before any processing
    print("Validating data types...")
    validation_report = validate_data_types(data)
    print(validation_report)


    data=data.dropna(how='any')
    data = data.fillna(0)
    has_nulls = data.isnull().values.any()

    data.to_csv("out.csv")

    if has_nulls:
        print("DataFrame contains null values.")
    else:
        print("DataFrame does not contain null values.")

    # print(data)

    overweight_min_thresh = -6  # Replace with your actual threshold
    results = run_trading_algorithm(data, overweight_min_thresh)
 
    print(results[["symbol", "sectorshort", "z_score","overamt"]])

    # Analyze component influence
    influence = analyze_component_influence(results)
    print("\nComponent Influence (%):")
    print(influence)

    # Examine components for the top result
    top_symbol = results.iloc[0]
    print(f"\nComponents for top symbol {top_symbol['symbol']}:")
    for component, value in top_symbol["z_components"].items():
        print(f"{component}: {value:.4f}")
    return results

def validate_data_types(df):
    """
    Validates data types and identifies potential issues in the DataFrame.
    Returns a detailed report of problematic values.
    """
    numeric_columns = [
        "price", "overamt", "divyield", "fcf_ni_ratio", "volat",
        "RSI", "mean50", "mean200", "div_growth_rate", "pe", 
        "average_pe", "PE_diff"
    ]
    
    issues = []
    
    for col in numeric_columns:
        if col not in df.columns:
            issues.append(f"Missing column: {col}")
            continue
            
        # Check for non-numeric values
        non_numeric_mask = pd.to_numeric(df[col], errors='coerce').isna() & df[col].notna()
        non_numeric_values = df[col][non_numeric_mask]
        
        if len(non_numeric_values) > 0:
            issues.append(f"\nColumn '{col}' contains non-numeric values:")
            for idx, val in non_numeric_values.items():
                issues.append(f"  Row {idx}: '{val}' (Symbol: {df.loc[idx, 'symbol']})")
    
        # Check for nulls
        null_mask = df[col].isna()
        null_count = null_mask.sum()
        if null_count > 0:
            issues.append(f"\nColumn '{col}' contains {null_count} null values:")
            for idx in df[null_mask].index:
                issues.append(f"  Row {idx}: NULL (Symbol: {df.loc[idx, 'symbol']})")
    
    # Print column dtypes for reference
    issues.append("\nCurrent column dtypes:")
    for col in numeric_columns:
        if col in df.columns:
            issues.append(f"  {col}: {df[col].dtype}")
    
    return "\n".join(issues)

main()


